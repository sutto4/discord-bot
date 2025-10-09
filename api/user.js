// GET /api/user/:userId - Fetch Discord user information
module.exports = async (req, res, client) => {
  try {
    const userId = req.params.userId;
    
    if (!userId) {
      return res.status(400).json({ error: 'User ID required' });
    }

    // Try to fetch user from Discord
    try {
      const user = await client.users.fetch(userId);
      
      return res.json({
        id: user.id,
        username: user.username,
        discriminator: user.discriminator,
        name: user.tag,
        avatar: user.displayAvatarURL({ size: 128 }),
        bot: user.bot || false
      });
    } catch (fetchError) {
      // User not found or error fetching
      console.error(`[USER-API] Failed to fetch user ${userId}:`, fetchError.message);
      return res.status(404).json({ 
        error: 'User not found',
        id: userId,
        username: userId
      });
    }
  } catch (error) {
    console.error('[USER-API] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};


