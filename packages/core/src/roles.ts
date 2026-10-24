/**
 * Team roles. A team owns sites; its members hold one role on all of
 * them. Guests are invited to a single site as editor or viewer.
 */
export const TEAM_ROLES = ['owner', 'admin', 'editor', 'viewer', 'billing'] as const
export type TeamRole = (typeof TEAM_ROLES)[number]
export const GUEST_ROLES = ['editor', 'viewer'] as const
export type GuestRole = (typeof GUEST_ROLES)[number]

/** What someone can do with a site: a team role, or a guest role on that site. */
export type SiteRole = TeamRole | `guest_${GuestRole}`

/**
 * read: see stats and saved reports. edit: goals, funnels, segments, imports, shared
 * links, reports, annotations, proxy, site details. manage: team members, guests,
 * new and deleted sites. own: team settings and moving sites between teams.
 * billing: the team's plan (billing members see no stats).
 */
export type Permission = 'read' | 'edit' | 'manage' | 'own' | 'billing'

const GRANTS: Record<SiteRole, Permission[]> = {
	owner: ['read', 'edit', 'manage', 'own', 'billing'],
	admin: ['read', 'edit', 'manage'],
	editor: ['read', 'edit'],
	viewer: ['read'],
	billing: ['billing'],
	guest_editor: ['read', 'edit'],
	guest_viewer: ['read'],
}

export function can(role: SiteRole | null | undefined, permission: Permission): boolean {
	return !!role && GRANTS[role].includes(permission)
}

export const isTeamRole = (r: unknown): r is TeamRole => TEAM_ROLES.includes(r as TeamRole)
export const isGuestRole = (r: unknown): r is GuestRole => GUEST_ROLES.includes(r as GuestRole)

/**
 * Whether `actor` may move a member from role `from` to `to` (null = add or remove).
 * Owners can do anything; admins manage everyone below owner and can't make owners.
 */
export function canAssign(actor: TeamRole | null | undefined, from: TeamRole | null, to: TeamRole | null): boolean {
	if (actor === 'owner') return true
	if (actor !== 'admin') return false
	return from !== 'owner' && to !== 'owner'
}

/** A team must always keep an owner: refuse a change that removes the last one. */
export function keepsOwner(owners: number, from: TeamRole | null, to: TeamRole | null): boolean {
	return !(from === 'owner' && to !== 'owner' && owners <= 1)
}
