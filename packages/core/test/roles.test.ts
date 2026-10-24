import { describe, expect, it } from 'vite-plus/test'
import { can, canAssign, keepsOwner } from '../src/roles'

describe('team roles', () => {
	it('grants permissions', () => {
		expect(can('owner', 'own')).toBe(true)
		expect(can('admin', 'manage')).toBe(true)
		expect(can('admin', 'own')).toBe(false)
		expect(can('editor', 'edit')).toBe(true)
		expect(can('editor', 'manage')).toBe(false)
		expect(can('viewer', 'read')).toBe(true)
		expect(can('viewer', 'edit')).toBe(false)
		expect(can('billing', 'read')).toBe(false)
		expect(can('billing', 'billing')).toBe(true)
		expect(can('guest_editor', 'edit')).toBe(true)
		expect(can('guest_viewer', 'edit')).toBe(false)
		expect(can(null, 'read')).toBe(false)
	})

	it('lets admins manage everyone below owner', () => {
		expect(canAssign('owner', 'owner', 'viewer')).toBe(true)
		expect(canAssign('admin', 'viewer', 'editor')).toBe(true)
		expect(canAssign('admin', null, 'admin')).toBe(true)
		expect(canAssign('admin', 'viewer', 'owner')).toBe(false)
		expect(canAssign('admin', 'owner', null)).toBe(false)
		expect(canAssign('editor', 'viewer', null)).toBe(false)
	})

	it('never removes the last owner', () => {
		expect(keepsOwner(1, 'owner', 'admin')).toBe(false)
		expect(keepsOwner(1, 'owner', null)).toBe(false)
		expect(keepsOwner(2, 'owner', null)).toBe(true)
		expect(keepsOwner(1, 'admin', null)).toBe(true)
	})
})
