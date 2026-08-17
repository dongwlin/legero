export type WorkspaceRole = 'owner' | 'staff'

export type AuthTokens = {
  accessToken: string
  tokenType: string
  accessTokenExpiresAt: string
  refreshToken: string
  refreshTokenExpiresAt: string
}

export type AuthUserDTO = {
  id: string
  phone: string
  role: WorkspaceRole
}

export type WorkspaceDTO = {
  id: string
  name: string
}

export type OrderDTO = {
  id: string
  version: number
  displayNo: string
  stapleTypeCode: number | null
  sizeCode: number
  customSizePriceCents: number | null
  stapleAmountCode: number
  extraStapleUnits: number
  friedEggCount: number
  tofuSkewerCount: number
  selectedMeatCodes: number[]
  greensCode: number
  scallionCode: number
  pepperCode: number
  diningMethodCode: number
  packagingCode: number | null
  packagingMethodCode: number | null
  totalPriceCents: number
  stapleStepStatusCode: number
  meatStepStatusCode: number
  note: string
  createdAt: string
  updatedAt: string
  completedAt: string | null
}

export type BootstrapResponse = {
  user: AuthUserDTO
  workspace: WorkspaceDTO
  permissions: string[]
  activeOrders: OrderDTO[]
  serverTime: string
}

export type LoginResponse = AuthTokens &
  BootstrapResponse

export type RefreshResponse = AuthTokens

export type OrderItemsResponse = {
  items: OrderDTO[]
}

export type OrderItemResponse = {
  item: OrderDTO
}

export type OrderListResponse = {
  items: OrderDTO[]
  nextCursor?: string | null
}

export type ClearWorkspaceMode = 'all' | 'before_today'

export type ClearOrdersResponse = {
  clearedCount: number
}

export type DailyStatsItemDTO = {
  date: string
  orderCount: number
  totalPriceCents: number
}

export type DailyStatsResponse = {
  items: DailyStatsItemDTO[]
}

export type OrderDeletedEvent = {
  id: string
}

export type OrdersClearedEvent = {
  clearedCount: number
  mode: ClearWorkspaceMode
  /**
   * The business-day cutoff (YYYY-MM-DD in the workspace timezone) the
   * server actually used when it executed the clear: every order created
   * before this key was deleted. Carried for `before_today` clears so the
   * client pins its barrier to the authoritative server date instead of
   * deriving one from the (possibly skewed or already-midnight) receipt
   * time. Absent for `all` clears (and older servers).
   */
  clearDateKey?: string
}

export type RealtimeSessionResponse = {
  ticket: string
  expiresAt: string
}

export type RealtimeReadyEvent = {
  serverTime: string
}
