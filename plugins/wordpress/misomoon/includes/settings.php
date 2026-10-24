<?php
// Settings > misomoon: where misomoon answers, the site id, and the optional parts.

if (!defined('ABSPATH')) {
	exit;
}

function misomoon_admin_menu() {
	add_options_page(__('misomoon', 'misomoon'), __('misomoon', 'misomoon'), 'manage_options', 'misomoon', 'misomoon_render_settings');
}
add_action('admin_menu', 'misomoon_admin_menu');

function misomoon_settings_link($links) {
	array_unshift($links, '<a href="' . esc_url(admin_url('options-general.php?page=misomoon')) . '">' . esc_html__('Settings', 'misomoon') . '</a>');
	return $links;
}
add_filter('plugin_action_links_' . plugin_basename(dirname(__DIR__) . '/misomoon.php'), 'misomoon_settings_link');

function misomoon_register_settings() {
	register_setting('misomoon', MISOMOON_OPTION, array(
		'type'              => 'array',
		'sanitize_callback' => 'misomoon_sanitize',
		'default'           => misomoon_defaults(),
	));
}
add_action('admin_init', 'misomoon_register_settings');

/** Keeps only valid values. An empty secret field keeps the saved secret, which the page never prints. */
function misomoon_sanitize($input) {
	$input = is_array($input) ? $input : array();
	$old = misomoon_options();
	$host = untrailingslashit(esc_url_raw(trim((string) ($input['host'] ?? '')), array('http', 'https')));
	if ($host !== '' && !preg_match('#^https?://[^\s/]+#i', $host)) {
		add_settings_error(MISOMOON_OPTION, 'host', __('The misomoon address must be a full URL, such as https://analytics.example.com.', 'misomoon'));
		$host = $old['host'];
	}
	$site = trim((string) ($input['site'] ?? ''));
	if ($site !== '' && !preg_match('/^[\w.-]{1,64}$/', $site)) {
		add_settings_error(MISOMOON_OPTION, 'site', __('The site id has letters, digits, dots, dashes and underscores only. Copy it from Settings > Install in misomoon.', 'misomoon'));
		$site = $old['site'];
	}
	$secret = trim((string) ($input['secret'] ?? ''));
	$out = array(
		'host'    => $host,
		'site'    => $site,
		'exclude' => !empty($input['exclude']),
		'proxy'   => !empty($input['proxy']),
		'hash'    => !empty($input['hash']),
		'woo'     => !empty($input['woo']),
		'secret'  => $secret !== '' ? $secret : $old['secret'],
	);
	if ($out['woo'] && $out['secret'] === '') {
		add_settings_error(MISOMOON_OPTION, 'secret', __('WooCommerce orders need the signing secret of the custom webhook. Make one under Settings > Revenue > Your server in misomoon.', 'misomoon'), 'warning');
	}
	return $out;
}

function misomoon_checkbox($key, $label, $help) {
	$o = misomoon_options();
	printf(
		'<label><input type="checkbox" name="%1$s[%2$s]" value="1" %3$s> %4$s</label><p class="description">%5$s</p>',
		esc_attr(MISOMOON_OPTION),
		esc_attr($key),
		checked($o[$key], true, false),
		esc_html($label),
		wp_kses($help, array('code' => array(), 'a' => array('href' => array())))
	);
}

function misomoon_render_settings() {
	if (!current_user_can('manage_options')) {
		return;
	}
	$o = misomoon_options();
	$name = esc_attr(MISOMOON_OPTION);
	$last = get_option('misomoon_last_payment');
	?>
	<div class="wrap">
		<h1><?php esc_html_e('misomoon analytics', 'misomoon'); ?></h1>
		<?php settings_errors(MISOMOON_OPTION); ?>
		<form action="options.php" method="post">
			<?php settings_fields('misomoon'); ?>
			<table class="form-table" role="presentation">
				<tr>
					<th scope="row"><label for="misomoon-host"><?php esc_html_e('misomoon address', 'misomoon'); ?></label></th>
					<td>
						<input id="misomoon-host" class="regular-text code" type="url" name="<?php echo $name; ?>[host]" value="<?php echo esc_attr($o['host']); ?>" placeholder="https://analytics.example.com">
						<p class="description"><?php esc_html_e('Where your misomoon dashboard runs.', 'misomoon'); ?></p>
					</td>
				</tr>
				<tr>
					<th scope="row"><label for="misomoon-site"><?php esc_html_e('Site id', 'misomoon'); ?></label></th>
					<td>
						<input id="misomoon-site" class="regular-text code" type="text" name="<?php echo $name; ?>[site]" value="<?php echo esc_attr($o['site']); ?>" placeholder="your-site">
						<p class="description"><?php esc_html_e('The value after ?s= in the snippet under Settings > Install in misomoon.', 'misomoon'); ?></p>
					</td>
				</tr>
				<tr>
					<th scope="row"><?php esc_html_e('Your own visits', 'misomoon'); ?></th>
					<td><?php misomoon_checkbox('exclude', __('Don\'t count people who can edit posts', 'misomoon'), __('Editors, authors and administrators load no tracker while they are logged in.', 'misomoon')); ?></td>
				</tr>
				<tr>
					<th scope="row"><?php esc_html_e('Ad blockers', 'misomoon'); ?></th>
					<td><?php misomoon_checkbox('proxy', __('Serve the tracker from this site', 'misomoon'), __('Loads the tracker and sends its events through <code>/wp-json/mm-relay/v1/</code>, so blockers that drop analytics hosts let it through. Visitor locations survive only when the site is behind Cloudflare. Elsewhere misomoon leaves the location unknown.', 'misomoon')); ?></td>
				</tr>
				<tr>
					<th scope="row"><?php esc_html_e('Hash routes', 'misomoon'); ?></th>
					<td><?php misomoon_checkbox('hash', __('Count #/route changes as pages', 'misomoon'), __('Only for a single-page app that routes with <code>#/</code>. Adds <code>data-hash</code>.', 'misomoon')); ?></td>
				</tr>
				<?php if (class_exists('WooCommerce')) : ?>
				<tr>
					<th scope="row"><?php esc_html_e('WooCommerce', 'misomoon'); ?></th>
					<td>
						<?php misomoon_checkbox('woo', __('Send orders and refunds to misomoon', 'misomoon'), __('Each paid order counts toward the source, country and device of the visit that placed it.', 'misomoon')); ?>
						<p>
							<label for="misomoon-secret"><?php esc_html_e('Signing secret', 'misomoon'); ?></label><br>
							<input id="misomoon-secret" class="regular-text code" type="password" autocomplete="off" name="<?php echo $name; ?>[secret]" value="" placeholder="<?php echo $o['secret'] !== '' ? esc_attr__('Saved. Paste a new one to replace it.', 'misomoon') : ''; ?>">
						</p>
						<p class="description"><?php esc_html_e('In misomoon, open Settings > Revenue, pick Your server, click Make signing secret, and paste it here.', 'misomoon'); ?></p>
						<?php if (is_array($last)) : ?>
						<p class="description">
							<?php
							echo esc_html(sprintf(
								/* translators: 1: order id, 2: time ago, 3: error */
								$last['ok'] ? __('Last order sent: %1$s, %2$s ago.', 'misomoon') : __('Last order failed: %1$s, %2$s ago: %3$s', 'misomoon'),
								$last['id'],
								human_time_diff((int) $last['at']),
								isset($last['error']) ? $last['error'] : ''
							));
							?>
						</p>
						<?php endif; ?>
					</td>
				</tr>
				<?php endif; ?>
			</table>
			<?php submit_button(); ?>
		</form>
		<?php if (misomoon_configured()) : ?>
		<h2><?php esc_html_e('What your pages load', 'misomoon'); ?></h2>
		<p><code><?php echo esc_html(misomoon_script_tag()); ?></code></p>
		<p><?php esc_html_e('Open your site in a private window: you appear in Live in misomoon within a few seconds. To send your own events, call misomoon(\'Signup\') from JavaScript.', 'misomoon'); ?></p>
		<?php endif; ?>
	</div>
	<?php
}
