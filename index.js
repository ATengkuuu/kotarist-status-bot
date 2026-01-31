require('dotenv').config();

const {
    Client,
    GatewayIntentBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require("discord.js");
const axios = require("axios");
const fs = require("fs");

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;
const SERVER_IP = process.env.SERVER_IP;
const CFX_SERVER_ID = process.env.CFX_SERVER_ID;
const LOGO_URL = process.env.LOGO_URL;
const BG_URL = process.env.BG_URL;
const WEBHOOK_URL = process.env.WEBHOOK_URL;

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

// Validasi environment variables
if (!BOT_TOKEN || !CHANNEL_ID || !CFX_SERVER_ID) {
    console.error('ERROR: Environment variables tidak lengkap!');
    console.error('Pastikan file .env sudah dibuat dengan benar.');
    console.error('Yang diperlukan: BOT_TOKEN, CHANNEL_ID, CFX_SERVER_ID');
    process.exit(1);
}

// Fungsi kirim notifikasi ke webhook (untuk event/alert)
async function sendWebhook(title, description, color, fields = []) {
    if (!WEBHOOK_URL) return; // Skip jika webhook tidak ada
    
    try {
        const embed = {
            title: title,
            description: description,
            color: color,
            fields: fields,
            timestamp: new Date().toISOString(),
            footer: {
                text: "Kotarist Roleplay Bot"
            }
        };
        
        await axios.post(WEBHOOK_URL, {
            embeds: [embed]
        });
        
        console.log(`[Webhook] Notifikasi terkirim: ${title}`);
    } catch (error) {
        console.error(`[Webhook Error] Gagal kirim notifikasi: ${error.message}`);
    }
}

// Fungsi update status live di webhook
async function updateWebhookStatus(status) {
    if (!WEBHOOK_URL) return;
    
    try {
        // Tentukan warna embed berdasarkan status
        let embedColor = 0x00FF00; // Hijau (Online)
        let statusEmoji = "🟢";
        let statusText = "ONLINE";
        
        if (status.maintenance) {
            embedColor = 0xFFA500; // Orange
            statusEmoji = "🟠";
            statusText = "MAINTENANCE";
        } else if (status.adminOnly) {
            embedColor = 0xFFFF00; // Kuning
            statusEmoji = "🟡";
            statusText = "ADMIN ONLY";
        } else if (!status.online) {
            embedColor = 0xFF0000; // Merah
            statusEmoji = "🔴";
            statusText = "OFFLINE";
        }
        
        // Hitung rata-rata dan tertinggi player
        const avgPlayers = playerStats.count > 0 ? (playerStats.total / playerStats.count).toFixed(1) : 0;
        const botUptime = await getBotUptime();
        
        const embed = {
            title: "🎮 Kotarist Roleplay — Live Status",
            description: `Update otomatis setiap 30 detik`,
            color: embedColor,
            fields: [
                {
                    name: "📊 STATUS SERVER",
                    value: `${statusEmoji} **${statusText}**`,
                    inline: true
                },
                {
                    name: "👥 PLAYERS ONLINE",
                    value: `**${status.players}** / **${status.maxPlayers}**`,
                    inline: true
                },
                {
                    name: "⏱️ SERVER UPTIME",
                    value: `${status.online ? formatUptime(status.uptime) : '0h 0m'}`,
                    inline: true
                },
                {
                    name: "📊 RATA-RATA PLAYER",
                    value: `${avgPlayers} player`,
                    inline: true
                },
                {
                    name: "🏆 PLAYER TERTINGGI",
                    value: playerStats.highestTime 
                        ? `${playerStats.highest} player\n⏰ ${playerStats.highestTime.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })}`
                        : `${playerStats.highest} player`,
                    inline: true
                },
                {
                    name: "🤖 BOT UPTIME",
                    value: botUptime,
                    inline: true
                }
            ],
            timestamp: new Date().toISOString(),
            footer: {
                text: "Kotarist Roleplay • Live Status"
            }
        };
        
        // Tambahkan info maintenance atau admin only jika ada
        if (status.maintenance) {
            embed.fields.push({
                name: "ℹ️ INFO PERBAIKAN",
                value: status.maintenanceReason || 'Server sedang dalam perbaikan',
                inline: false
            });
        }
        
        if (status.adminOnly) {
            embed.fields.push({
                name: "ℹ️ INFO ADMIN ONLY",
                value: status.adminReason || 'Server hanya untuk admin sementara',
                inline: false
            });
        }
        
        // Jika sudah ada message, edit. Jika belum, kirim baru
        if (webhookMessageId) {
            // Edit message yang sudah ada
            try {
                await axios.patch(`${WEBHOOK_URL}/messages/${webhookMessageId}`, {
                    embeds: [embed]
                });
                console.log(`[Webhook] Status diupdate: ${status.players}/${status.maxPlayers} players`);
            } catch (editError) {
                // Jika gagal edit (message dihapus), kirim baru
                console.log(`[Webhook] Gagal edit, kirim message baru`);
                const response = await axios.post(WEBHOOK_URL + '?wait=true', {
                    embeds: [embed]
                });
                webhookMessageId = response.data.id;
            }
        } else {
            // Kirim message baru dan simpan ID-nya
            const response = await axios.post(WEBHOOK_URL + '?wait=true', {
                embeds: [embed]
            });
            webhookMessageId = response.data.id;
            console.log(`[Webhook] Live status message dibuat: ID ${webhookMessageId}`);
        }
    } catch (error) {
        console.error(`[Webhook Error] Gagal update status: ${error.message}`);
    }
}

let botStartTime = Date.now();
let lastKnownStatus = null; // Track status terakhir
let webhookMessageId = null; // Track message ID webhook untuk edit
let webhookMessageToken = null; // Track message token webhook

// Tracking statistik player
let playerStats = {
    records: [],
    highest: 0,
    highestTime: null, // Waktu player tertinggi tercapai
    total: 0,
    count: 0,
    lastRecordedCount: null, // Player count terakhir yang dicatat
    lastRecordTime: null // Waktu pencatatan terakhir
};

async function getBotUptime() {
    const uptimeMs = Date.now() - botStartTime;
    const hours = Math.floor(uptimeMs / (1000 * 60 * 60));
    const minutes = Math.floor((uptimeMs % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
}

function formatUptime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
}

// Fungsi terpisah untuk mengambil data server agar lebih rapi
async function fetchServerData() {
    try {
        // Menggunakan CFX.re API untuk data realtime
        const response = await axios.get(`https://servers-frontend.fivem.net/api/servers/single/${CFX_SERVER_ID}`, {
            timeout: 10000,
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) DiscordBot/1.0' }
        });
        
        const serverData = response.data.Data;
        const players = parseInt(serverData.clients) || 0;
        const maxPlayers = parseInt(serverData.sv_maxclients) || 32;
        const serverUptime = parseInt(serverData.vars?.uptime) || 0;
        
        console.log(`[CFX API] Successfully fetched: ${players}/${maxPlayers} players, Uptime: ${formatUptime(serverUptime)}`);
        
        // Catat statistik player HANYA jika:
        // 1. Ada perubahan player count ATAU
        // 2. Sudah lewat 5 menit sejak pencatatan terakhir
        const now = Date.now();
        const shouldRecord = 
            playerStats.lastRecordedCount === null || // Pencatatan pertama
            playerStats.lastRecordedCount !== players || // Ada perubahan player
            (now - (playerStats.lastRecordTime || 0)) >= 300000; // Sudah 5 menit (300000ms)
        
        if (shouldRecord) {
            playerStats.records.push(players);
            playerStats.total += players;
            playerStats.count++;
            playerStats.lastRecordedCount = players;
            playerStats.lastRecordTime = now;
            
            console.log(`[Statistik] Tercatat: ${players} players (Total data: ${playerStats.count})`);
        }
        
        // Update player tertinggi (selalu check, tidak perlu tunggu 5 menit)
        if (players > playerStats.highest) {
            playerStats.highest = players;
            playerStats.highestTime = new Date();
        }
        
        return {
            online: true,
            players: players,
            maxPlayers: maxPlayers,
            uptime: serverUptime
        };
    } catch (error) {
        console.log(`[Fetch Error] Gagal mengambil data server: ${error.message}`);
        
        return {
            online: false,
            players: 0,
            maxPlayers: 0,
            uptime: 0
        };
    }
}

async function getStatus() {
    // 1. Ambil data server (Player count, dll) terlebih dahulu
    //    Ini memperbaiki bug 0/0. Kita ambil datanya dulu, baru tentukan label statusnya.
    const serverData = await fetchServerData();
    
    // Default response object
    let statusResponse = {
        online: serverData.online,
        players: serverData.players,
        maxPlayers: serverData.maxPlayers,
        uptime: serverData.uptime || 0,
        maintenance: false,
        adminOnly: false,
        maintenanceReason: null,
        adminReason: null
    };

    // 2. Cek File Maintenance (Prioritas Tertinggi)
    try {
        if (fs.existsSync('./maintenance.txt')) {
            const maintenanceText = fs.readFileSync('./maintenance.txt', 'utf8').trim();
            statusResponse.maintenance = true;
            statusResponse.maintenanceReason = maintenanceText || 'Server sedang dalam perbaikan';
            // Jika maintenance, biasanya kita anggap player 0, tapi kalau mau tetap baca status asli server, biarkan players apa adanya.
            // Di sini saya set online false agar status barnya merah jika full maintenance
            statusResponse.online = false; 
            return statusResponse;
        }
    } catch (err) { console.log('Error reading maintenance file:', err.message); }

    // 3. Cek File Admin Only (Prioritas Kedua)
    try {
        if (fs.existsSync('./admin-only.txt')) {
            const adminText = fs.readFileSync('./admin-only.txt', 'utf8').trim();
            
            statusResponse.adminOnly = true;
            statusResponse.online = serverData.online; // Tetap online, hanya dilabeli Admin Only
            statusResponse.adminReason = adminText || 'Server hanya untuk admin sementara';
            
            // LOGGING UNTUK DEBUG
            if (serverData.online) {
                console.log(`[Admin-Only Mode] Server Online. Players: ${statusResponse.players}/${statusResponse.maxPlayers}`);
            } else {
                console.log(`[Admin-Only Mode] Server Offline/Unreachable.`);
            }

            return statusResponse;
        }
    } catch (err) { console.log('Error reading admin-only file:', err.message); }

    // 4. Jika tidak ada file maintenance/admin, return status normal (Public)
    if (serverData.online) {
        console.log(`[Public Mode] Server Online. Players: ${statusResponse.players}/${statusResponse.maxPlayers}`);
    } else {
        console.log(`[Public Mode] Server Offline.`);
    }

    return statusResponse;
}

async function buildEmbed() {
    const status = await getStatus();
    const embedColor = 0x00BFFF; 

    // Tentukan Status Text
    let statusTitle = "🔴 Offline";
    let statusValue = "🔴 OFFLINE";

    if (status.maintenance) {
        statusTitle = "🟠 Maintenance";
        statusValue = "🟠 MAINTENANCE";
    } else if (status.adminOnly) {
        // Jika server online tapi file admin ada
        if (status.online) {
            statusTitle = "🟡 Admin Only";
            statusValue = "🟡 ADMIN ONLY";
        } else {
            statusTitle = "🔴 Admin Only (Offline)";
            statusValue = "🔴 OFFLINE";
        }
    } else if (status.online) {
        statusTitle = "🟢 Online";
        statusValue = "🟢 ONLINE";
    }

    const embed = new EmbedBuilder()
        .setColor(embedColor)
        .setTitle("Kotarist Roleplay — Server Status")
        .setThumbnail(LOGO_URL)
        .setImage(BG_URL)
        .addFields(
            {
                name: "STATUS",
                value: `\`\`\`\n${statusValue}\n\`\`\``,
                inline: true
            },
            {
                name: "PLAYERS",
                value: `\`\`\`\n${status.players} / ${status.maxPlayers}\n\`\`\``,
                inline: true
            }
        );

    // Tambahkan field khusus jika ada maintenance atau admin only
    if (status.maintenance) {
        embed.addFields({
            name: "INFO PERBAIKAN", 
            value: `\`\`\`\n${status.maintenanceReason}\n\`\`\``,
            inline: false
        });
    }

    if (status.adminOnly) {
        embed.addFields({
            name: "INFO ADMIN ONLY",
            value: `\`\`\`\n${status.adminReason}\n\`\`\``,
            inline: false
        });
    }

    // Field Connect & Info lainnya
    embed.addFields(
        {
            name: "F8 Connect Server - Alternative 1",
            value: "```\nconnect kotaku.mayernetwork.net\n```",
            inline: false
        },
        {
            name: "F8 Connect Server - Alternative 2",
            value: "```\nconnect kotaku-asia.mayernetwork.net\n```",
            inline: false
        },
        {
            name: "RESTART INFO",
            value: `Cek pengumuman restart di <#1444684560418865245>`,
            inline: false
        },
        {
            name: "SERVER UPTIME",
            value: `\`\`\`\n${status.online ? formatUptime(status.uptime) : '0h 0m'}\n\`\`\``,
            inline: false
        }
    )
    .setFooter({ text: "Kotarist Roleplay • Update setiap 30 detik" })
    .setTimestamp();

    return embed;
}

async function updateBotPresence() {
    try {
        const status = await getStatus();
        let activityName;

        if (status.maintenance) {
            activityName = `[${status.players}/${status.maxPlayers}] on KOTARIST (Maintenance)`;
        } else if (status.adminOnly) {
            // Tampilkan player count juga saat admin only jika server online
            if (status.online) {
                activityName = `[${status.players}/${status.maxPlayers}] on KOTARIST (Admin Only)`;
            } else {
                activityName = "[0/0] on KOTARIST (Offline)";
            }
        } else if (status.online) {
            activityName = `[${status.players}/${status.maxPlayers}] on KOTARIST`;
        } else {
            activityName = "[0/0] on KOTARIST (Offline)";
        }
        
        client.user.setPresence({
            status: "online",
            activities: [{
                name: activityName,
                type: 3 // Watching
            }]
        });
    } catch (error) {
        console.log('Error updating bot presence:', error.message);
    }
}

async function update() {
    try {
        const channel = await client.channels.fetch(CHANNEL_ID);
        if (!channel) {
            console.log("Channel tidak ditemukan!");
            return;
        }

        const status = await getStatus();
        
        // Deteksi perubahan status
        if (lastKnownStatus !== null) {
            if (lastKnownStatus.online !== status.online) {
                if (status.online) {
                    console.log("Server kembali online!");
                    await sendWebhook(
                        "Server Online",
                        "Server Kotarist Roleplay kembali online!",
                        0x00FF00, // Hijau
                        [
                            { name: "Players", value: `${status.players}/${status.maxPlayers}`, inline: true },
                            { name: "Uptime", value: formatUptime(status.uptime), inline: true }
                        ]
                    );
                } else {
                    console.log("Server offline terdeteksi!");
                    await sendWebhook(
                        "Server Offline",
                        "Server Kotarist Roleplay sedang offline atau tidak dapat diakses.",
                        0xFF0000 // Merah
                    );
                }
            }
            
            if (!lastKnownStatus.maintenance && status.maintenance) {
                console.log("Server masuk mode maintenance");
                await sendWebhook(
                    "Maintenance Mode",
                    `Server masuk mode maintenance.\n\n**Alasan:** ${status.maintenanceReason}`,
                    0xFFA500 // Orange
                );
            }
            
            if (!lastKnownStatus.adminOnly && status.adminOnly) {
                console.log("Server masuk mode Admin Only");
                await sendWebhook(
                    "Admin Only Mode",
                    `Server masuk mode Admin Only.\n\n**Alasan:** ${status.adminReason}`,
                    0xFFFF00, // Kuning
                    [
                        { name: "Players", value: `${status.players}/${status.maxPlayers}`, inline: true }
                    ]
                );
            }
        }
        
        lastKnownStatus = { ...status };

        const embed = await buildEmbed();
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel("CONNECT SERVER")
                .setStyle(ButtonStyle.Link)
                .setURL("https://cfx.re/join/8r7365")
        );

        const messages = await channel.messages.fetch({ limit: 1 });

        if (messages.size === 0) {
            await channel.send({ embeds: [embed], components: [row] });
        } else {
            const msg = messages.first();
            if (msg.author.id === client.user.id) {
                await msg.edit({ embeds: [embed], components: [row] });
            }
        }
        
        await updateBotPresence();
        
        // Update webhook status setiap update
        await updateWebhookStatus(status);
    } catch (error) {
        console.log("Error pada fungsi update utama:", error.message);
    }
}

client.on("clientReady", async () => {
    console.log(`Bot online sebagai ${client.user.tag}`);
    botStartTime = Date.now();
    console.log("Bot berhasil online!");
    
    // Kirim webhook notifikasi bot startup
    const initialStatus = await getStatus();
    if (initialStatus.online) {
        await sendWebhook(
            "Bot Online - Server Status",
            `Bot berhasil startup!\n\n**Status Server:** ${initialStatus.maintenance ? 'Maintenance' : (initialStatus.adminOnly ? 'Admin Only' : 'Public Online')}`,
            0x00BFFF, // Biru
            [
                { name: "Players", value: `${initialStatus.players}/${initialStatus.maxPlayers}`, inline: true },
                { name: "Uptime", value: formatUptime(initialStatus.uptime), inline: true }
            ]
        );
    } else {
        await sendWebhook(
            "Bot Online - Server Offline",
            "Bot berhasil startup tapi server sedang offline.",
            0xFF0000 // Merah
        );
    }
    
    update();
    setInterval(update, 30000); // Update setiap 30 detik untuk response lebih cepat
});

// Log error yang tidak tertangani
process.on('unhandledRejection', (error) => {
    console.error('Unhandled Rejection:', error);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    process.exit(1);
});

// Log saat bot disconnect
client.on('disconnect', async () => {
    console.log('Bot disconnected from Discord');
    const botUptime = formatUptime((Date.now() - botStartTime) / 1000);
    await sendWebhook(
        "Bot Terputus dari Discord",
        "Bot terputus dari Discord.",
        0xFFA500,
        [
            { name: "Bot Uptime", value: botUptime, inline: true }
        ]
    );
});

// Log saat bot error
client.on('error', (error) => {
    console.error('Discord client error:', error);
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('Received SIGINT, shutting down gracefully...');
    const botUptime = formatUptime((Date.now() - botStartTime) / 1000);
    
    // Hitung statistik player
    const avgPlayers = playerStats.count > 0 ? (playerStats.total / playerStats.count).toFixed(1) : 0;
    const highestPlayers = playerStats.highest;
    const highestTimeStr = playerStats.highestTime 
        ? playerStats.highestTime.toLocaleString('id-ID', { 
            hour: '2-digit', 
            minute: '2-digit',
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            timeZoneName: 'short'
          })
        : 'Belum tercatat';
    
    const fields = [
        { name: "Bot Berjalan Selama", value: botUptime, inline: true },
        { name: "Waktu Shutdown", value: new Date().toLocaleString('id-ID'), inline: true },
        { name: "\u200B", value: "\u200B", inline: false },
        { name: "📊 Statistik Player", value: "Data selama bot berjalan", inline: false },
        { name: "Rata-rata Player", value: `${avgPlayers} player`, inline: true },
        { name: "Player Tertinggi", value: `${highestPlayers} player\n🕐 ${highestTimeStr}`, inline: true },
        { name: "Total Data Tercatat", value: `${playerStats.count} kali update`, inline: true }
    ];
    
    await sendWebhook(
        "Bot Offline (Manual Shutdown)",
        "Bot dimatikan secara manual.",
        0xFF0000,
        fields
    );
    await client.destroy();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('Received SIGTERM, shutting down gracefully...');
    const botUptime = formatUptime((Date.now() - botStartTime) / 1000);
    
    // Hitung statistik player
    const avgPlayers = playerStats.count > 0 ? (playerStats.total / playerStats.count).toFixed(1) : 0;
    const highestPlayers = playerStats.highest;
    const highestTimeStr = playerStats.highestTime 
        ? playerStats.highestTime.toLocaleString('id-ID', { 
            hour: '2-digit', 
            minute: '2-digit',
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            timeZoneName: 'short'
          })
        : 'Belum tercatat';
    
    const fields = [
        { name: "Bot Berjalan Selama", value: botUptime, inline: true },
        { name: "Waktu Shutdown", value: new Date().toLocaleString('id-ID'), inline: true },
        { name: "\u200B", value: "\u200B", inline: false },
        { name: "📊 Statistik Player", value: "Data selama bot berjalan", inline: false },
        { name: "Rata-rata Player", value: `${avgPlayers} player`, inline: true },
        { name: "Player Tertinggi", value: `${highestPlayers} player\n🕐 ${highestTimeStr}`, inline: true },
        { name: "Total Data Tercatat", value: `${playerStats.count} kali update`, inline: true }
    ];
    
    await sendWebhook(
        "Bot Offline (System Shutdown)",
        "Bot dimatikan oleh sistem.",
        0xFF0000,
        fields
    );
    await client.destroy();
    process.exit(0);
});

client.login(BOT_TOKEN);