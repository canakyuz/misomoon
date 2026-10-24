<?php
// Requests from WordPress to misomoon: events on behalf of a visitor (the proxy and the
// WooCommerce refs), and signed payments to the custom webhook. The visitor's address
// travels in x-misomoon-ip the way core/src/proxy.ts reads it, so the event gets the same
// daily visitor id as the visitor's own browser.

if (!defined('ABSPATH')) {
	exit;
}

/**
 * The visitor's address, in the order the Node SDK reads it: Cloudflare, True-Client-IP,
 * X-Real-IP, the first X-Forwarded-For, then the connection. Filter `misomoon_visitor_ip`
 * to trust only the headers your host sets; a filtered value that is not an address is
 * ignored.
 */
function misomoon_visitor_ip() {
	$candidates = array();
	foreach (array('HTTP_CF_CONNECTING_IP', 'HTTP_TRUE_CLIENT_IP', 'HTTP_X_REAL_IP') as $key) {
		if (!empty($_SERVER[$key])) {
			$candidates[] = $_SERVER[$key];
		}
	}
	if (!empty($_SERVER['HTTP_X_FORWARDED_FOR'])) {
		$candidates[] = explode(',', $_SERVER['HTTP_X_FORWARDED_FOR'])[0];
	}
	if (!empty($_SERVER['REMOTE_ADDR'])) {
		$candidates[] = $_SERVER['REMOTE_ADDR'];
	}
	$ip = '';
	foreach ($candidates as $c) {
		$c = trim((string) $c);
		if (filter_var($c, FILTER_VALIDATE_IP)) {
			$ip = $c;
			break;
		}
	}
	$filtered = trim((string) apply_filters('misomoon_visitor_ip', $ip));
	return filter_var($filtered, FILTER_VALIDATE_IP) ? $filtered : $ip;
}

/**
 * The headers misomoon reads behind a proxy, for a visitor with this address and user
 * agent. Location comes from Cloudflare's headers when the site is behind Cloudflare;
 * without them misomoon leaves the location unknown.
 */
function misomoon_visitor_headers($ip, $user_agent, $language = '') {
	$headers = array(
		'user-agent'   => $user_agent,
		'x-misomoon-ip' => $ip,
	);
	if ($language !== '') {
		$headers['accept-language'] = $language;
	}
	$country = isset($_SERVER['HTTP_CF_IPCOUNTRY']) ? strtoupper(trim($_SERVER['HTTP_CF_IPCOUNTRY'])) : '';
	// XX and T1 are Cloudflare's unknown and Tor markers
	if (preg_match('/^[A-Z]{2}$/', $country) && $country !== 'XX' && $country !== 'T1') {
		$headers['x-misomoon-country'] = $country;
	}
	$geo = array(
		'HTTP_CF_REGION'      => 'x-misomoon-region',
		'HTTP_CF_IPCITY'      => 'x-misomoon-city',
		'HTTP_CF_IPCONTINENT' => 'x-misomoon-continent',
		'HTTP_CF_TIMEZONE'    => 'x-misomoon-timezone',
	);
	foreach ($geo as $key => $name) {
		if (!empty($_SERVER[$key])) {
			$headers[$name] = rawurlencode(trim($_SERVER[$key]));
		}
	}
	return $headers;
}

/** The headers for the visitor of the current request. */
function misomoon_current_visitor_headers() {
	$ua = isset($_SERVER['HTTP_USER_AGENT']) ? (string) $_SERVER['HTTP_USER_AGENT'] : '';
	$lang = isset($_SERVER['HTTP_ACCEPT_LANGUAGE']) ? (string) $_SERVER['HTTP_ACCEPT_LANGUAGE'] : '';
	return misomoon_visitor_headers(misomoon_visitor_ip(), $ua, $lang);
}

/** Posts one event body to <host>/api/event. Returns whether misomoon took it. */
function misomoon_send_event($body, $headers) {
	if (!misomoon_configured() || empty($headers['x-misomoon-ip']) || empty($headers['user-agent'])) {
		return false;
	}
	$res = wp_remote_post(misomoon_host() . '/api/event', array(
		'timeout' => 5,
		'headers' => array_merge($headers, array('content-type' => 'text/plain')),
		'body'    => $body,
	));
	return !is_wp_error($res) && wp_remote_retrieve_response_code($res) < 300;
}

/** A payment ref like m.js makes: mm_ and 24 hex digits. */
function misomoon_new_ref() {
	return 'mm_' . bin2hex(random_bytes(12));
}

/**
 * Hands out a ref from a visitor's visit: an engagement with no time and the ref, which
 * misomoon stores with the visit the address and user agent have open. Returns the ref,
 * or '' when there is no address or user agent to find the visit by, or misomoon didn't
 * take the beacon.
 */
function misomoon_hand_out_ref($url, $ip, $user_agent) {
	if (!filter_var($ip, FILTER_VALIDATE_IP) || $user_agent === '' || !misomoon_configured()) {
		return '';
	}
	$ref = misomoon_new_ref();
	$body = wp_json_encode(array(
		's' => misomoon_options()['site'],
		'n' => 'engagement',
		'u' => $url,
		'e' => 0,
		'k' => $ref,
	));
	return misomoon_send_event($body, misomoon_visitor_headers($ip, $user_agent)) ? $ref : '';
}

/** `sha256=<hex HMAC-SHA256 of the body>`, as verifyCustom in core/src/payments.ts checks. */
function misomoon_signature($secret, $body) {
	return 'sha256=' . hash_hmac('sha256', $body, $secret);
}

/**
 * Sends a payment or refund to the custom webhook (docs/revenue.md). Fields use the
 * webhook's names: id, amount, currency, type, refund_of, ref, customer, subscription,
 * billing, ts. A network error, 429 or 5xx is tried again from WP-Cron, up to 3 more times;
 * the id makes a resend count once.
 */
function misomoon_send_payment($payment, $attempt = 1) {
	$o = misomoon_options();
	if (!misomoon_configured() || $o['secret'] === '') {
		return false;
	}
	$body = wp_json_encode(array_filter($payment, function ($v) {
		return $v !== null && $v !== '';
	}));
	$res = wp_remote_post(misomoon_host() . '/api/webhooks/custom/' . rawurlencode($o['site']), array(
		'timeout' => 10,
		'headers' => array(
			'content-type'         => 'application/json',
			'x-misomoon-signature' => misomoon_signature($o['secret'], $body),
		),
		'body'    => $body,
	));
	$code = is_wp_error($res) ? 0 : (int) wp_remote_retrieve_response_code($res);
	if ($code >= 200 && $code < 300) {
		update_option('misomoon_last_payment', array('ok' => true, 'at' => time(), 'id' => $payment['id']), false);
		return true;
	}
	$retry = $code === 0 || $code === 429 || $code >= 500;
	$reason = is_wp_error($res) ? $res->get_error_message() : ('status ' . $code . ': ' . substr(wp_remote_retrieve_body($res), 0, 300));
	update_option('misomoon_last_payment', array('ok' => false, 'at' => time(), 'id' => $payment['id'], 'error' => $reason), false);
	if ($retry && $attempt < 4) {
		// 1, 5, then 25 minutes
		wp_schedule_single_event(time() + 60 * (5 ** ($attempt - 1)), 'misomoon_retry_payment', array($payment, $attempt + 1));
	}
	return false;
}
add_action('misomoon_retry_payment', 'misomoon_send_payment', 10, 2);
