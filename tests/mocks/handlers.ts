import type {
  AuthTokens,
  AuthUserDTO,
  BootstrapResponse,
  LoginResponse,
  OrderDTO,
  WorkspaceDTO,
} from '@/services/apiTypes'
import type { RequestHandler } from 'msw'
import { DEFAULT_ORDER_FORM_VALUE } from '@/types/orderForm'
import { STEP_STATUS } from '@/types/codes'

export const TEST_API_BASE_URL = 'http://api.test'

export const TEST_TOKENS: AuthTokens = {
  accessToken: 'access-token',
  tokenType: 'Bearer',
  accessTokenExpiresAt: '2099-01-01T00:00:00.000Z',
  refreshToken: 'refresh-token',
  refreshTokenExpiresAt: '2099-01-01T00:00:00.000Z',
}

export const TEST_USER: AuthUserDTO = {
  id: 'user-1',
  phone: '13800138000',
  role: 'owner',
}

export const TEST_WORKSPACE: WorkspaceDTO = {
  id: 'workspace-1',
  name: '测试门店',
}

/**
 * Keep the fixture on a fixed business date. Integration tests set the
 * system clock to the same date before rendering an order page, so filtering
 * by "today" remains deterministic and independent of the machine clock.
 */
export const TEST_ORDER_DATE = '2026-09-03'

export const createOrderDto = (
  overrides: Partial<OrderDTO> = {},
): OrderDTO => ({
  id: '202609030001',
  version: 1,
  displayNo: '0001',
  ...DEFAULT_ORDER_FORM_VALUE,
  selectedMeatCodes: [...DEFAULT_ORDER_FORM_VALUE.selectedMeatCodes],
  totalPriceCents: 1500,
  stapleStepStatusCode: STEP_STATUS.notStarted,
  meatStepStatusCode: STEP_STATUS.notStarted,
  createdAt: `${TEST_ORDER_DATE}T10:00:00+08:00`,
  updatedAt: `${TEST_ORDER_DATE}T10:00:00+08:00`,
  completedAt: null,
  ...overrides,
})

export const createBootstrapResponse = (
  overrides: Partial<BootstrapResponse> = {},
): BootstrapResponse => ({
  user: TEST_USER,
  workspace: TEST_WORKSPACE,
  permissions: ['orders:read', 'orders:write'],
  activeOrders: [],
  serverTime: '2026-09-03T02:00:00.000Z',
  ...overrides,
})

export const createLoginResponse = (
  overrides: Partial<LoginResponse> = {},
): LoginResponse => ({
  ...TEST_TOKENS,
  ...createBootstrapResponse(),
  ...overrides,
})

/**
 * The integration suite installs handlers per scenario. Keeping this list
 * empty means an accidentally unhandled request fails loudly through the
 * MSW `onUnhandledRequest: 'error'` policy instead of silently touching a
 * real service.
 */
export const handlers: RequestHandler[] = []
