<?php
// Prints the script tag in <head>, the same tag as Settings > Install in misomoon. The
// tracker reads its site from ?s= and posts next to its own URL; through the proxy,
// data-api names the event route outright, because plain permalinks put the route in the
// query string, where a relative URL can't follow it.

if (!defined('ABSPATH')) {
	exit;
}

/** Whether this page view should load the tracker. Filter `misomoon_should_track` to decide yourself. */
function misomoon_should_track() {
	$track = misomoon_configured() && !is_preview() && !is_customize_preview();
	if ($track && misomoon_options()['exclude'] && is_user_logged_in() && current_user_can('edit_posts')) {
		$track = false;
	}
	return (bool) apply_filters('misomoon_should_track', $track);
}

/** The script tag's attributes: src, and data-api and data-hash when they apply. */
function misomoon_script_attributes() {
	$o = misomoon_options();
	if ($o['proxy']) {
		$src = misomoon_proxy_url('m.js');
		$attrs = array('data-api' => misomoon_proxy_url('api/event'));
	} else {
		$src = misomoon_host() . '/m.js';
		$attrs = array();
	}
	$attrs = array_merge(array('src' => add_query_arg('s', rawurlencode($o['site']), $src)), $attrs);
	if ($o['hash']) {
		$attrs['data-hash'] = '';
	}
	return (array) apply_filters('misomoon_script_attributes', $attrs);
}

function misomoon_script_tag() {
	$html = '<script defer';
	foreach (misomoon_script_attributes() as $name => $value) {
		$html .= ' ' . esc_attr($name);
		if ($value !== '') {
			$html .= '="' . ($name === 'src' || $name === 'data-api' ? esc_url($value) : esc_attr($value)) . '"';
		}
	}
	return $html . "></script>\n";
}

function misomoon_print_tracker() {
	if (misomoon_should_track()) {
		echo misomoon_script_tag(); // phpcs:ignore WordPress.Security.EscapeOutput -- escaped in misomoon_script_tag
	}
}
add_action('wp_head', 'misomoon_print_tracker', 1);
