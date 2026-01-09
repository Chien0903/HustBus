const Redis = require('ioredis');
const { getVietnamISOString } = require('../utils/vietnamTime');

let redisClient;
let warnedMissingRedisUrl = false;

function getRedisClient() {
    if (!redisClient) {
        const redisUrl = process.env.REDIS_URL;

        if (!redisUrl) {
            if (!warnedMissingRedisUrl) {
                console.warn('⚠️  REDIS_URL not configured. Refresh tokens will not persist.');
                warnedMissingRedisUrl = true;
            }
            return null;
        }

        try {
            redisClient = new Redis(redisUrl, {
                maxRetriesPerRequest: 3,
                enableReadyCheck: true,
                retryStrategy(times) {
                    const delay = Math.min(times * 50, 2000);
                    return delay;
                },
            });

            redisClient.on('connect', () => {
                console.log('✅ Redis connected successfully');
            });

            redisClient.on('error', (err) => {
                console.error('❌ Redis connection error:', err.message);
            });

            redisClient.on('ready', () => {
                console.log('✅ Redis ready to use');
            });
        } catch (error) {
            console.error('❌ Failed to initialize Redis:', error.message);
            return null;
        }
    }

    return redisClient;
}

// Helper functions for refresh tokens
const REFRESH_TOKEN_PREFIX = 'refresh_token:';
const USER_TOKENS_PREFIX = 'user_tokens:';

/**
 * Save refresh token to Redis
 * @param {string} userId - User ID
 * @param {string} refreshToken - The refresh token
 * @param {number} expirySeconds - TTL in seconds (default 7 days)
 */
async function saveRefreshToken(userId, refreshToken, expirySeconds = 7 * 24 * 60 * 60) {
    const client = getRedisClient();
    if (!client) return false;

    try {
        const tokenKey = `${REFRESH_TOKEN_PREFIX}${refreshToken}`;
        const userTokensKey = `${USER_TOKENS_PREFIX}${userId}`;

        // Store token with user ID and metadata
        await client.setex(
            tokenKey,
            expirySeconds,
            JSON.stringify({
                userId,
                createdAt: getVietnamISOString(),
            })
        );

        // Track all tokens for this user (for multi-device support)
        await client.sadd(userTokensKey, refreshToken);
        await client.expire(userTokensKey, expirySeconds);

        return true;
    } catch (error) {
        console.error('Error saving refresh token to Redis:', error);
        return false;
    }
}

/**
 * Get user ID from refresh token
 * @param {string} refreshToken - The refresh token
 * @returns {Promise<string|null>} User ID or null
 */
async function getUserIdFromToken(refreshToken) {
    const client = getRedisClient();
    if (!client) return null;

    try {
        const tokenKey = `${REFRESH_TOKEN_PREFIX}${refreshToken}`;
        const data = await client.get(tokenKey);

        if (!data) return null;

        const parsed = JSON.parse(data);
        return parsed.userId;
    } catch (error) {
        console.error('Error getting user ID from token:', error);
        return null;
    }
}

/**
 * Delete refresh token from Redis
 * @param {string} refreshToken - The refresh token
 */
async function deleteRefreshToken(refreshToken) {
    const client = getRedisClient();
    if (!client) return false;

    try {
        const tokenKey = `${REFRESH_TOKEN_PREFIX}${refreshToken}`;

        // Get user ID before deleting
        const data = await client.get(tokenKey);
        if (data) {
            const parsed = JSON.parse(data);
            const userTokensKey = `${USER_TOKENS_PREFIX}${parsed.userId}`;

            // Remove from user's token set
            await client.srem(userTokensKey, refreshToken);
        }

        // Delete the token
        await client.del(tokenKey);
        return true;
    } catch (error) {
        console.error('Error deleting refresh token:', error);
        return false;
    }
}

/**
 * Revoke all refresh tokens for a user
 * @param {string} userId - User ID
 */
async function revokeAllUserTokens(userId) {
    const client = getRedisClient();
    if (!client) return false;

    try {
        const userTokensKey = `${USER_TOKENS_PREFIX}${userId}`;
        const tokens = await client.smembers(userTokensKey);

        // Delete all tokens
        for (const token of tokens) {
            const tokenKey = `${REFRESH_TOKEN_PREFIX}${token}`;
            await client.del(tokenKey);
        }

        // Delete the set
        await client.del(userTokensKey);
        return true;
    } catch (error) {
        console.error('Error revoking all user tokens:', error);
        return false;
    }
}

// Helper functions for search history
const SEARCH_HISTORY_PREFIX = 'search_history:';
const SEARCH_HISTORY_TTL = 2 * 60 * 60; // 2 hours in seconds

/**
 * Save search history to Redis
 * @param {string} userId - User ID
 * @param {object} searchData - Search data (from, to, timestamp)
 * @param {number} ttlSeconds - TTL in seconds (default 2 hours)
 */
async function saveSearchHistory(userId, searchData, ttlSeconds = SEARCH_HISTORY_TTL) {
    console.log('📝 saveSearchHistory called for user:', userId);

    const client = getRedisClient();
    if (!client) {
        console.log('❌ Redis client not available');
        return false;
    }

    try {
        const historyKey = `${SEARCH_HISTORY_PREFIX}${userId}`;
        const timestamp = Date.now();

        console.log('Saving to Redis key:', historyKey);
        console.log('Search data:', JSON.stringify(searchData, null, 2));

        // Store search data with timestamp as score in sorted set
        await client.zadd(
            historyKey,
            timestamp,
            JSON.stringify({
                ...searchData,
                timestamp
            })
        );

        // Limit to 5 most recent items - remove oldest if count > 5
        const count = await client.zcard(historyKey);
        if (count > 5) {
            // Keep only the 5 most recent (highest scores/timestamps)
            // Remove from start (index 0) to (count - 6) to keep last 5
            await client.zremrangebyrank(historyKey, 0, count - 6);
            console.log(`🗑️ Trimmed history to 5 items (removed ${count - 5} old items)`);
        }

        // Set TTL on the sorted set
        await client.expire(historyKey, ttlSeconds);

        console.log('✅ Successfully saved to Redis with TTL:', ttlSeconds);
        return true;
    } catch (error) {
        console.error('❌ Error saving search history to Redis:', error);
        return false;
    }
}

/**
 * Get search history for a user
 * @param {string} userId - User ID
 * @returns {Promise<Array>} Array of search history items
 */
async function getSearchHistory(userId) {
    const client = getRedisClient();
    if (!client) return [];

    try {
        const historyKey = `${SEARCH_HISTORY_PREFIX}${userId}`;

        // Get all items from sorted set, ordered by timestamp (newest first)
        const items = await client.zrevrange(historyKey, 0, -1);

        if (!items || items.length === 0) return [];

        // Parse JSON strings back to objects
        return items.map(item => {
            try {
                return JSON.parse(item);
            } catch (e) {
                console.error('Error parsing search history item:', e);
                return null;
            }
        }).filter(item => item !== null);
    } catch (error) {
        console.error('Error getting search history from Redis:', error);
        return [];
    }
}

/**
 * Delete a specific search history item
 * @param {string} userId - User ID
 * @param {number} timestamp - Timestamp of the item to delete
 * @returns {Promise<boolean>} Success status
 */
async function deleteSearchHistoryItem(userId, timestamp) {
    const client = getRedisClient();
    if (!client) return false;

    try {
        const historyKey = `${SEARCH_HISTORY_PREFIX}${userId}`;

        // Find and remove item with matching timestamp
        const items = await client.zrevrange(historyKey, 0, -1);

        for (const item of items) {
            try {
                const parsed = JSON.parse(item);
                if (parsed.timestamp === parseInt(timestamp)) {
                    await client.zrem(historyKey, item);
                    return true;
                }
            } catch (e) {
                console.error('Error parsing item during deletion:', e);
            }
        }

        return false;
    } catch (error) {
        console.error('Error deleting search history item:', error);
        return false;
    }
}

module.exports = {
    getRedisClient,
    saveRefreshToken,
    getUserIdFromToken,
    deleteRefreshToken,
    revokeAllUserTokens,
    saveSearchHistory,
    getSearchHistory,
    deleteSearchHistoryItem,
};
