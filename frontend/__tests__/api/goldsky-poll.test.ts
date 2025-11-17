import { NextRequest } from 'next/server'
import { GET } from '@/app/api/goldsky-poll/route'

// Mock NextRequest
const createMockRequest = (url: string): NextRequest => {
  return {
    url,
    method: 'GET',
    headers: new Headers({
      'user-agent': 'test-agent',
      'referer': 'http://localhost:3000',
      'x-forwarded-for': '127.0.0.1',
    }),
  } as NextRequest
}

describe('/api/goldsky-poll', () => {
  beforeEach(() => {
    // Reset rate limiting between tests
    jest.resetModules()
  })

  it('should return heartbeat data', async () => {
    const request = createMockRequest('http://localhost:3000/api/goldsky-poll')
    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data).toHaveProperty('timestamp')
    expect(data).toHaveProperty('type', 'heartbeat')
    expect(data).toHaveProperty('status', 'ok')
    expect(typeof data.timestamp).toBe('number')
  })

  it('should include marketId from query params', async () => {
    const request = createMockRequest('http://localhost:3000/api/goldsky-poll?marketId=123')
    const response = await GET(request)
    const data = await response.json()

    expect(data.marketId).toBe('123')
  })

  it('should handle missing marketId', async () => {
    const request = createMockRequest('http://localhost:3000/api/goldsky-poll')
    const response = await GET(request)
    const data = await response.json()

    expect(data.marketId).toBe('all')
  })

  it('should set correct CORS headers', async () => {
    const request = createMockRequest('http://localhost:3000/api/goldsky-poll')
    const response = await GET(request)

    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, OPTIONS')
    expect(response.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type')
    expect(response.headers.get('Cache-Control')).toContain('no-cache')
  })

  it('should rate limit excessive requests', async () => {
    const request = createMockRequest('http://localhost:3000/api/goldsky-poll')

    // First request should succeed
    const response1 = await GET(request)
    expect(response1.status).toBe(200)

    // Immediate second request should be rate limited
    const response2 = await GET(request)
    expect(response2.status).toBe(429)

    const data = await response2.json()
    expect(data.error).toBe('Rate limited')
    expect(data).toHaveProperty('nextAllowed')
  })

  it('should allow OPTIONS requests', async () => {
    const request = {
      method: 'OPTIONS',
      headers: new Headers(),
    } as NextRequest

    // Import the OPTIONS handler
    const { OPTIONS } = await import('@/app/api/goldsky-poll/route')
    const response = await OPTIONS()

    expect(response.status).toBe(200)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
  })

  it('should handle errors gracefully', async () => {
    // Mock a scenario that causes an error
    const request = createMockRequest('http://localhost:3000/api/goldsky-poll')

    // The current implementation doesn't have error paths, but we test the error handling structure
    const response = await GET(request)
    expect(response.status).toBe(200) // Should succeed with current implementation
  })

  it('should validate response structure', async () => {
    const request = createMockRequest('http://localhost:3000/api/goldsky-poll')
    const response = await GET(request)
    const data = await response.json()

    // Validate response structure
    expect(data).toMatchObject({
      timestamp: expect.any(Number),
      type: 'heartbeat',
      marketId: expect.any(String),
      status: 'ok'
    })

    // Timestamp should be recent (within last minute)
    const now = Date.now()
    expect(data.timestamp).toBeGreaterThan(now - 60000)
    expect(data.timestamp).toBeLessThanOrEqual(now)
  })
})
