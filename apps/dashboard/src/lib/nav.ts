import Activity from '@lucide/svelte/icons/activity'
import Filter from '@lucide/svelte/icons/filter'
import Gauge from '@lucide/svelte/icons/gauge'
import LayoutDashboard from '@lucide/svelte/icons/layout-dashboard'
import MousePointerClick from '@lucide/svelte/icons/mouse-pointer-click'
import Route from '@lucide/svelte/icons/route'
import Settings from '@lucide/svelte/icons/settings-2'
import type { View } from './url'

/** Each view's name in the top navigation and the command palette, and its icon in the palette. */
export const VIEW_INFO: Record<View, { label: string; icon: typeof Activity }> = {
	overview: { label: 'Overview', icon: LayoutDashboard },
	realtime: { label: 'Live', icon: Activity },
	funnels: { label: 'Funnels', icon: Filter },
	journeys: { label: 'Paths', icon: Route },
	behavior: { label: 'Behavior', icon: MousePointerClick },
	vitals: { label: 'Speed', icon: Gauge },
	settings: { label: 'Settings', icon: Settings },
}
