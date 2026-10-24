<?php
// WooCommerce orders as misomoon payments (docs/revenue.md). When an order is placed, the
// plugin hands out a ref from the buyer's visit, found by the address and user agent
// WooCommerce stores on the order, and keeps it in the order's meta. When the order is
// paid, it sends the payment with that ref to the custom webhook; a refund follows its
// order. Classic and block checkouts both create orders through woocommerce_new_order.

if (!defined('ABSPATH')) {
	exit;
}

const MISOMOON_REF_META = '_misomoon_ref';
const MISOMOON_SENT_META = '_misomoon_sent';

function misomoon_woo_enabled() {
	$o = misomoon_options();
	return $o['woo'] && $o['secret'] !== '' && misomoon_configured() && function_exists('wc_get_order');
}

/** The ref for an order placed by a shopper, from the visit they placed it in. */
function misomoon_woo_order_created($order_id, $order = null) {
	if (!misomoon_woo_enabled()) {
		return;
	}
	$order = $order instanceof WC_Order ? $order : wc_get_order($order_id);
	// an order made in wp-admin has the shop manager's address, not the buyer's
	if (!$order || $order->get_meta(MISOMOON_REF_META) || $order->get_created_via() === 'admin' || (is_admin() && !wp_doing_ajax())) {
		return;
	}
	$ip = (string) $order->get_customer_ip_address();
	$ua = (string) $order->get_customer_user_agent();
	// a draft from the block checkout may not have them yet; this request is the shopper's
	if ($ip === '' || $ua === '') {
		$ip = misomoon_visitor_ip();
		$ua = isset($_SERVER['HTTP_USER_AGENT']) ? (string) $_SERVER['HTTP_USER_AGENT'] : '';
	}
	$ref = misomoon_hand_out_ref(wc_get_checkout_url(), $ip, $ua);
	if ($ref !== '') {
		$order->update_meta_data(MISOMOON_REF_META, $ref);
		$order->save_meta_data();
	}
}
add_action('woocommerce_new_order', 'misomoon_woo_order_created', 10, 2);
// a second chance once the checkout is placed, for an order that got no ref when it was created
add_action('woocommerce_checkout_order_processed', function ($order_id) {
	misomoon_woo_order_created($order_id);
});
add_action('woocommerce_store_api_checkout_order_processed', function ($order) {
	misomoon_woo_order_created($order->get_id(), $order);
});

/** Sends a paid order once. A repeat, from a later status change, is skipped here and would count once anyway. */
function misomoon_woo_order_paid($order_id) {
	if (!misomoon_woo_enabled()) {
		return;
	}
	$order = wc_get_order($order_id);
	if (!$order || $order->get_meta(MISOMOON_SENT_META) || (float) $order->get_total() <= 0) {
		return;
	}
	$customer = (int) $order->get_customer_id();
	$paid = $order->get_date_paid() ? $order->get_date_paid() : $order->get_date_created();
	$ok = misomoon_send_payment(array(
		'id'       => 'wc_' . $order->get_id(),
		'amount'   => (float) $order->get_total(),
		'currency' => $order->get_currency(),
		'ref'      => (string) $order->get_meta(MISOMOON_REF_META),
		// guests have no customer id; their later orders can't follow the first one
		'customer' => $customer > 0 ? 'wc_customer_' . $customer : null,
		'billing'  => 'one_time',
		'ts'       => $paid ? $paid->getTimestamp() : null,
	));
	// a failed send retries from WP-Cron; marking it now keeps a status change from sending it twice
	$order->update_meta_data(MISOMOON_SENT_META, $ok ? 'yes' : 'queued');
	$order->save_meta_data();
}
add_action('woocommerce_payment_complete', 'misomoon_woo_order_paid');
// orders paid outside a gateway (bank transfer, cash on delivery) are paid when they move on
add_action('woocommerce_order_status_processing', 'misomoon_woo_order_paid');
add_action('woocommerce_order_status_completed', 'misomoon_woo_order_paid');

function misomoon_woo_order_refunded($order_id, $refund_id) {
	if (!misomoon_woo_enabled()) {
		return;
	}
	$order = wc_get_order($order_id);
	$refund = wc_get_order($refund_id);
	if (!$order || !$refund || !$order->get_meta(MISOMOON_SENT_META)) {
		return;
	}
	$amount = abs((float) $refund->get_amount());
	if ($amount <= 0) {
		return;
	}
	$created = $refund->get_date_created();
	misomoon_send_payment(array(
		'id'        => 'wc_refund_' . $refund->get_id(),
		'type'      => 'refund',
		'refund_of' => 'wc_' . $order->get_id(),
		'amount'    => $amount,
		'currency'  => $order->get_currency(),
		'ts'        => $created ? $created->getTimestamp() : null,
	));
}
add_action('woocommerce_order_refunded', 'misomoon_woo_order_refunded', 10, 2);

/** WooCommerce's high-performance order storage: the plugin reads and writes orders only through its API. */
add_action('before_woocommerce_init', function () {
	if (class_exists('\Automattic\WooCommerce\Utilities\FeaturesUtil')) {
		\Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility('custom_order_tables', dirname(__DIR__) . '/misomoon.php', true);
	}
});
