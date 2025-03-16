// Shoutout plugin for MaxBot

const fs = require('fs');
const path = require('path');

const plugin = {
    name: 'shoutout',
    version: '1.0.0',
    description: 'Shout out other streamers',
    author: 'MaxBot',
    
    // Plugin state
    enabled: true,
    client: null,
    logger: null,
    commandManager: null,
    
    // Plugin configuration
    config: {
        enabled: true,
        autoShoutout: {
            enabled: true,
            cooldownHours: 24
        },
        cooldownMinutes: 60,
        excludedUsers: [],
        messages: {
            streamer: "🎮 Check out @{username} over at https://twitch.tv/{username} - They're an awesome streamer! 👍",
            nonStreamer: "💖 Shoutout to @{username} - Thanks for being an awesome part of our community! 💖"
        }
    },
    
    // Shoutout history
    history: {},
    
    // Commands provided by this plugin
    commands: [],
    
    // Initialize plugin
    init: function(bot, logger) {
        this.bot = bot;
        this.client = bot.client;
        this.logger = logger;
        this.commandManager = bot.commandManager;
        
        this.logger.info('[Shoutout] Plugin initializing...');
        
        // Load history
        this.loadHistory();
        
        // Set up commands
        this.setupCommands();
        
        this.logger.info('[Shoutout] Plugin initialized successfully');
        return true;
    },
    
    // Set up commands based on configuration
    setupCommands: function() {
        this.commands = [];
        
        // Add shoutout command
        this.commands.push({
            name: 'shoutout',
            config: {
                description: 'Shout out another streamer',
                usage: '!shoutout [username]',
                aliases: ['so'],
                cooldown: 5,
                modOnly: true,
                enabled: true
            },
            execute: async (client, channel, context, commandText) => {
                try {
                    // Get the username from the message
                    const parts = commandText.trim().split(' ');
                    const username = parts.length > 1 ? parts[1].toLowerCase().replace('@', '') : null;
                    
                    if (!username) {
                        await client.say(channel, `@${context.username} Please specify a username to shout out.`);
                        return false;
                    }
                    
                    // Perform the shoutout
                    await this.doShoutout(client, channel, username);
                    return true;
                } catch (error) {
                    this.logger.error(`[Shoutout] Error in shoutout command:`, error);
                    return false;
                }
            }
        });
    },
    
    // Process incoming messages for auto-shoutouts
    processIncomingMessage: async function(messageObj) {
        // Skip if auto-shoutout is disabled
        if (!this.config.autoShoutout || !this.config.autoShoutout.enabled) {
            return messageObj;
        }
        
        // Skip if this is a command or from the bot itself
        if (messageObj.message.startsWith('!') || messageObj.message.startsWith('?') || messageObj.self) {
            return messageObj;
        }
        
        // Check if this user should get a shoutout
        const username = messageObj.tags.username.toLowerCase();
        
        // Skip excluded users
        if (this.config.excludedUsers.includes(username)) {
            return messageObj;
        }
        
        // Only auto-shoutout streamers
        if (!this.isStreamer(username)) {
            return messageObj;
        }
        
        // Check if we've already shouted out this user recently
        const now = Date.now();
        const userHistory = this.history[username];
        let lastShoutout = 0;
        
        if (userHistory && userHistory.lastShoutout) {
            lastShoutout = userHistory.lastShoutout;
        }
        
        // Use cooldownHours from config if available, otherwise fall back to cooldownMinutes
        const cooldownMs = this.config.autoShoutout.cooldownHours 
            ? this.config.autoShoutout.cooldownHours * 60 * 60 * 1000 
            : this.config.cooldownMinutes * 60 * 1000;
        
        if (now - lastShoutout > cooldownMs) {
            // Perform the shoutout
            await this.doShoutout(this.client, messageObj.channel, username);
        }
        
        return messageObj;
    },
    
    // Perform a shoutout for a user
    doShoutout: async function(client, channel, username) {
        try {
            // Log the shoutout
            this.logger.info(`[Shoutout] Shouting out ${username}`);
            
            // Determine if the user is a streamer based on history or known streamers
            const isStreamer = this.isStreamer(username);
            
            // Get the appropriate message template based on whether the user is a streamer
            let messageTemplate;
            if (isStreamer) {
                messageTemplate = this.config.messages?.streamer || "Check out @{displayName} over at {url}";
            } else {
                messageTemplate = this.config.messages?.nonStreamer || "Shoutout to @{displayName} - Thanks for being an awesome part of our community!";
            }
            
            // Get game info if available
            const gameInfo = this.getGameInfo(username);
            
            // Replace placeholders in the message
            const message = messageTemplate.replace(/\{username\}/g, username)
                                          .replace(/\{displayName\}/g, username)
                                          .replace(/\{url\}/g, `https://twitch.tv/${username}`)
                                          .replace(/\{gameInfo\}/g, gameInfo);
            
            // Send the message
            await client.say(channel, message);
            
            // Record the shoutout in history
            this.recordShoutout(username);
            
            return true;
        } catch (error) {
            this.logger.error(`[Shoutout] Error performing shoutout:`, error);
            return false;
        }
    },
    
    // Check if a user is a streamer
    isStreamer: function(username) {
        // Convert username to lowercase for case-insensitive comparison
        const lowerUsername = username.toLowerCase();
        
        // Check if we have history data for this user
        if (this.history[lowerUsername]) {
            // If the history entry has game info, they're likely a streamer
            if (this.history[lowerUsername].game) {
                return true;
            }
        }
        
        // Known streamers list - could be expanded or loaded from config
        const knownStreamers = [
            'maxthriller',
            'cergttv',
            'jynxzi',
            'zackrawrr',
            'nexusrift_'
        ];
        
        return knownStreamers.includes(lowerUsername);
    },
    
    // Get game info for a user if available
    getGameInfo: function(username) {
        // Convert username to lowercase for case-insensitive comparison
        const lowerUsername = username.toLowerCase();
        
        // Check if we have game info in history
        if (this.history[lowerUsername] && this.history[lowerUsername].game) {
            return `currently playing ${this.history[lowerUsername].game}`;
        }
        
        // Default game info
        return "they're an awesome streamer";
    },
    
    // Record a shoutout in history
    recordShoutout: function(username) {
        const now = Date.now();
        const lowerUsername = username.toLowerCase();
        
        // Create or update history entry
        if (!this.history[lowerUsername]) {
            this.history[lowerUsername] = {
                displayName: username,
                lastShoutout: now,
                url: `https://twitch.tv/${lowerUsername}`
            };
        } else {
            this.history[lowerUsername].lastShoutout = now;
            
            // Ensure displayName is set
            if (!this.history[lowerUsername].displayName) {
                this.history[lowerUsername].displayName = username;
            }
            
            // Ensure URL is set
            if (!this.history[lowerUsername].url) {
                this.history[lowerUsername].url = `https://twitch.tv/${lowerUsername}`;
            }
        }
        
        this.saveHistory();
    },
    
    // Load shoutout history from file
    loadHistory: function() {
        try {
            const historyFile = path.join(__dirname, '..', 'config', 'shoutout-history.json');
            const oldHistoryFile = path.join(__dirname, '..', 'data', 'shoutout-history.json');
            
            // Check if history exists in config directory first
            if (fs.existsSync(historyFile)) {
                const data = fs.readFileSync(historyFile, 'utf8');
                this.history = JSON.parse(data);
                this.logger.info(`[Shoutout] Loaded shoutout history for ${Object.keys(this.history).length} users from config directory`);
            } 
            // Fall back to old location in data directory
            else if (fs.existsSync(oldHistoryFile)) {
                const data = fs.readFileSync(oldHistoryFile, 'utf8');
                const oldHistory = JSON.parse(data);
                
                // Convert old format (if needed)
                if (typeof oldHistory === 'object') {
                    // Check if we need to convert from old format (simple timestamp) to new format (object with details)
                    let needsConversion = false;
                    for (const key in oldHistory) {
                        if (typeof oldHistory[key] === 'number') {
                            needsConversion = true;
                            break;
                        }
                    }
                    
                    if (needsConversion) {
                        this.logger.info(`[Shoutout] Converting history from old format to new format`);
                        const newHistory = {};
                        for (const username in oldHistory) {
                            newHistory[username] = {
                                displayName: username,
                                lastShoutout: oldHistory[username],
                                url: `https://twitch.tv/${username}`
                            };
                        }
                        this.history = newHistory;
                    } else {
                        this.history = oldHistory;
                    }
                } else {
                    this.history = {};
                }
                
                this.logger.info(`[Shoutout] Loaded shoutout history for ${Object.keys(this.history).length} users from data directory`);
                
                // Save to new location
                this.saveHistory();
            } else {
                this.history = {};
                this.logger.info(`[Shoutout] No shoutout history found, starting fresh`);
            }
        } catch (error) {
            this.logger.error(`[Shoutout] Error loading shoutout history:`, error);
            this.history = {};
        }
    },
    
    // Save shoutout history to file
    saveHistory: function() {
        try {
            const historyFile = path.join(__dirname, '..', 'config', 'shoutout-history.json');
            
            // Create directory if it doesn't exist
            const configDir = path.join(__dirname, '..', 'config');
            if (!fs.existsSync(configDir)) {
                fs.mkdirSync(configDir, { recursive: true });
            }
            
            fs.writeFileSync(historyFile, JSON.stringify(this.history, null, 2));
            this.logger.info(`[Shoutout] Saved shoutout history for ${Object.keys(this.history).length} users`);
        } catch (error) {
            this.logger.error(`[Shoutout] Error saving shoutout history:`, error);
        }
    },
    
    // Enable plugin
    enable: function() {
        this.config.enabled = true;
        this.saveConfig();
        return true;
    },
    
    // Disable plugin
    disable: function() {
        this.config.enabled = false;
        this.saveConfig();
        return true;
    },
    
    // Save configuration
    saveConfig: function() {
        try {
            // If we have a bot object with a plugin manager, save the configuration
            if (this.bot && this.bot.pluginManager) {
                this.bot.pluginManager.savePluginConfig('shoutout', this.config);
            }
        } catch (error) {
            this.logger.error(`[Shoutout] Error saving configuration:`, error);
        }
    }
};

module.exports = plugin; 