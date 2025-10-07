/**
 * Member Cache Utility
 * 
 * Provides a caching layer for guild members to reduce Discord API rate limit hits.
 * Uses TTL (time-to-live) to automatically expire stale data.
 */

class MemberCache {
  constructor() {
    // Map<guildId, { members: Map<userId, member>, lastFetch: timestamp, isFull: boolean }>
    this.cache = new Map();
    this.TTL = 5 * 60 * 1000; // 5 minutes default TTL
    this.MAX_CACHE_SIZE = 100; // Max guilds to cache
  }

  /**
   * Check if cache for a guild is valid (not expired)
   */
  isValid(guildId) {
    const cached = this.cache.get(guildId);
    if (!cached) return false;
    return Date.now() - cached.lastFetch < this.TTL;
  }

  /**
   * Get cached members for a guild
   */
  get(guildId) {
    if (!this.isValid(guildId)) {
      this.cache.delete(guildId);
      return null;
    }
    return this.cache.get(guildId);
  }

  /**
   * Store members in cache
   */
  set(guildId, members, isFull = false) {
    // Implement LRU eviction if cache is too large
    if (this.cache.size >= this.MAX_CACHE_SIZE && !this.cache.has(guildId)) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    this.cache.set(guildId, {
      members: new Map(members.map(m => [m.id, m])),
      lastFetch: Date.now(),
      isFull
    });
  }

  /**
   * Update a single member in cache
   */
  updateMember(guildId, member) {
    const cached = this.cache.get(guildId);
    if (cached) {
      cached.members.set(member.id, member);
    }
  }

  /**
   * Remove a member from cache
   */
  removeMember(guildId, userId) {
    const cached = this.cache.get(guildId);
    if (cached) {
      cached.members.delete(userId);
    }
  }

  /**
   * Clear cache for a specific guild
   */
  clear(guildId) {
    this.cache.delete(guildId);
  }

  /**
   * Clear all cache
   */
  clearAll() {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getStats() {
    let totalMembers = 0;
    this.cache.forEach(cached => {
      totalMembers += cached.members.size;
    });

    return {
      guilds: this.cache.size,
      totalMembers,
      ttl: this.TTL
    };
  }
}

// Singleton instance
const memberCache = new MemberCache();

module.exports = memberCache;

