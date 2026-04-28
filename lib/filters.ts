export type Filter = 'walking' | 'under40' | 'under55' | '18holes' | '9holes'

// Full labels — used in the results panel filter pills
export const FILTER_LABELS: Record<Filter, string> = {
  walking: 'Walking only',
  under40: 'Under $40',
  under55: 'Under $55',
  '18holes': '18 holes',
  '9holes': '9 holes',
}

// Abbreviated labels — used in the chat panel's compact active-filters banner
export const FILTER_LABELS_SHORT: Record<Filter, string> = {
  walking: 'Walking',
  under40: '<$40',
  under55: '<$55',
  '18holes': '18h',
  '9holes': '9h',
}
