<?php
// A first-party proxy through the REST API (docs/PROXY.md, "Your own proxy"): the three
// paths every proxy maps, under /wp-json/mm-relay/v1/. The namespace avoids words that
// filter lists block. It runs only when the "Serve from this site" setting is on.

if (!defined('ABSPATH')) {
	exit;
}

const MISOMOON_REST_NAMESPACE = 'mm-relay/v1';
/** browsers cache m.js for five minutes, as when misomoon serves it */
const MISOMOON_SCRIPT_TTL = 300;
/** the largest beacon misomoon accepts (apps/api/src/ingest.ts) */
const MISOMOON_MAX_BEACON = 16384;

/** The proxy URL of a path: m.js, api/event or overlay.js. */
function misomoon_proxy_url($path) {
	return rest_url(MISOMOON_REST_NAMESPACE . '/' . $path);
}

function misomoon_register_proxy() {
	if (!misomoon_options()['proxy']) {
		return;
	}
	$public = '__return_true';
	register_rest_route(MISOMOON_REST_NAMESPACE, '/m\.js', array(
		'methods'             => 'GET',
		'permission_callback' => $public,
		'callback'            => function () {
			return misomoon_proxy_script('m.js');
		},
	));
	register_rest_route(MISOMOON_REST_NAMESPACE, '/overlay\.js', array(
		'methods'             => 'GET',
		'permission_callback' => $public,
		'callback'            => function () {
			return misomoon_proxy_script('overlay.js');
		},
	));
	register_rest_route(MISOMOON_REST_NAMESPACE, '/api/event', array(
		'methods'             => 'POST',
		'permission_callback' => $public,
		'callback'            => 'misomoon_proxy_event',
	));
}
add_action('rest_api_init', 'misomoon_register_proxy');

/**
 * Fetches a script from misomoon, cached for five minutes. m.js always comes for the
 * configured site, whatever ?s= the request carries, so the proxy serves only your site.
 */
function misomoon_proxy_script($file) {
	if (!misomoon_configured()) {
		return new WP_REST_Response('', 404);
	}
	$url = misomoon_host() . '/' . $file;
	if ($file === 'm.js') {
		$url .= '?s=' . rawurlencode(misomoon_options()['site']);
	}
	$key = 'misomoon_js_' . md5($url);
	$code = get_transient($key);
	if ($code === false) {
		$res = wp_remote_get($url, array('timeout' => 5));
		if (is_wp_error($res) || wp_remote_retrieve_response_code($res) !== 200) {
			return new WP_REST_Response('', 502);
		}
		$code = wp_remote_retrieve_body($res);
		set_transient($key, $code, MISOMOON_SCRIPT_TTL);
	}
	$response = new WP_REST_Response($code, 200);
	$response->header('Content-Type', 'application/javascript; charset=utf-8');
	$response->header('Cache-Control', 'public, max-age=' . MISOMOON_SCRIPT_TTL);
	return $response;
}

/** Forwards a beacon with the visitor's address, user agent and language. Answers 202 as misomoon does. */
function misomoon_proxy_event(WP_REST_Request $request) {
	$body = $request->get_body();
	if ($body !== '' && strlen($body) <= MISOMOON_MAX_BEACON) {
		misomoon_send_event($body, misomoon_current_visitor_headers());
	}
	return new WP_REST_Response('', 202);
}

/**
 * The REST API sends JSON; the scripts must go out as they are. This prints the proxy's
 * string bodies raw, with the headers set above, and leaves every other route alone.
 */
function misomoon_serve_raw($served, $result, $request) {
	if ($served || strpos($request->get_route(), '/' . MISOMOON_REST_NAMESPACE . '/') !== 0) {
		return $served;
	}
	$data = $result instanceof WP_HTTP_Response ? $result->get_data() : null;
	if (!is_string($data)) {
		return $served;
	}
	echo $data; // phpcs:ignore WordPress.Security.EscapeOutput -- JavaScript from misomoon, served as JavaScript
	return true;
}
add_filter('rest_pre_serve_request', 'misomoon_serve_raw', 10, 3);
