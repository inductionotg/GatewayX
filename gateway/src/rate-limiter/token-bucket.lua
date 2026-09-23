-- All applicable buckets are checked and debited in ONE atomic operation.
-- ARGV contains capacity/refill-per-second pairs corresponding to KEYS.
local clock = redis.call('TIME')
local now = tonumber(clock[1]) * 1000 + math.floor(tonumber(clock[2]) / 1000)
local buckets = {}
local allowed = 1
local retryMs = 0
local selected = 1

for i, key in ipairs(KEYS) do
  local capacity = tonumber(ARGV[(i - 1) * 2 + 1])
  local rate = tonumber(ARGV[(i - 1) * 2 + 2])
  if not capacity or capacity < 1 or not rate or rate <= 0 then
    return redis.error_reply('Invalid token bucket policy')
  end
  local state = redis.call('HMGET', key, 'tokens', 'updatedAt')
  local tokens = tonumber(state[1]) or capacity
  local previous = tonumber(state[2]) or now
  -- Never mint tokens when the server clock moves backwards.
  local elapsed = math.max(0, now - previous)
  tokens = math.min(capacity, tokens + elapsed * rate / 1000)
  local timestamp = math.max(now, previous)
  local wait = 0
  if tokens < 1 then
    allowed = 0
    wait = math.ceil((1 - tokens) * 1000 / rate + math.max(0, previous - now))
    if wait > retryMs then
      retryMs = wait
      selected = i
    end
  end
  buckets[i] = {tokens = tokens, timestamp = timestamp, capacity = capacity, rate = rate}
end

for i, key in ipairs(KEYS) do
  local bucket = buckets[i]
  if allowed == 1 then bucket.tokens = bucket.tokens - 1 end
  redis.call('HSET', key,
    'tokens', string.format('%.17g', bucket.tokens),
    'updatedAt', string.format('%.0f', bucket.timestamp))
  -- An expired bucket may restart full only once it could have refilled fully.
  local ttl = math.max(1000, math.ceil(bucket.capacity * 1000 / bucket.rate
    + math.max(0, bucket.timestamp - now)))
  redis.call('PEXPIRE', key, ttl)
end

local result = buckets[selected]
return {allowed, result.capacity, math.floor(result.tokens), retryMs, selected}
