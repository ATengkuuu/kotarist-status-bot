const axios = require("axios");
const os = require("os");

class DiscordLogger {
    constructor(webhookUrl) {
        this.webhookUrl = webhookUrl;
        this.botStartTime = new Date();
    }

    async sendLog(level, message, details = null) {
        try {
            const colors = {
                INFO: 0x3498db,    // Biru
                SUCCESS: 0x2ecc71, // Hijau
                WARNING: 0xf39c12, // Kuning
                ERROR: 0xe74c3c,   // Merah
                DEBUG: 0x9b59b6    // Ungu
            };

            const embed = {
                title: `🤖 Bot Log - ${level}`,
                description: message,
                color: colors[level] || 0x95a5a6,
                fields: [],
                timestamp: new Date().toISOString(),
                footer: {
                    text: `Kotaku Status Bot | ${os.hostname()}`
                }
            };

            if (details) {
                if (typeof details === 'object') {
                    embed.fields.push({
                        name: "📋 Details",
                        value: `\`\`\`json\n${JSON.stringify(details, null, 2).substring(0, 1000)}\n\`\`\``,
                        inline: false
                    });
                } else {
                    embed.fields.push({
                        name: "📋 Details",
                        value: `\`\`\`\n${details}\n\`\`\``,
                        inline: false
                    });
                }
            }

            // Tambahkan info sistem
            embed.fields.push({
                name: "💻 System Info",
                value: `Platform: ${os.platform()}\nNode: ${process.version}\nUptime: ${this.formatUptime(process.uptime())}`,
                inline: true
            });

            await axios.post(this.webhookUrl, {
                username: "Kotaku Bot Logger",
                avatar_url: "https://cdn.discordapp.com/attachments/1445254812894494872/1451861042459312158/Untitled.png",
                embeds: [embed]
            });
        } catch (error) {
            console.error('Failed to send webhook:', error.message);
        }
    }

    formatUptime(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        return `${hours}h ${minutes}m ${secs}s`;
    }

    // Method shortcut
    info(message, details) {
        return this.sendLog('INFO', message, details);
    }

    success(message, details) {
        return this.sendLog('SUCCESS', message, details);
    }

    warning(message, details) {
        return this.sendLog('WARNING', message, details);
    }

    error(message, details) {
        return this.sendLog('ERROR', message, details);
    }

    debug(message, details) {
        return this.sendLog('DEBUG', message, details);
    }
}

module.exports = DiscordLogger;