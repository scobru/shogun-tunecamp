import { Telegraf } from 'telegraf';
import path from 'path';
import fs from 'fs-extra';
import axios from 'axios';
import { ScannerService } from '../scanner.js';
import { DatabaseService } from '../database.js';

export class TelegramBotService {
    private bot?: Telegraf;
    private isRunning = false;
    private recentContext = new Map<string, { photoId?: string, caption?: string, timestamp: number }>();

    constructor(
        private database: DatabaseService,
        private scanner: ScannerService,
        private musicDir: string
    ) {}

    private async safeReply(ctx: any, text: string, retryCount = 0): Promise<any> {
        try {
            return await ctx.reply(text);
        } catch (err: any) {
            if (err.response?.error_code === 429 && retryCount < 3) {
                const retryAfter = (err.response?.parameters?.retry_after || 5) * 1000;
                console.warn(`[TelegramBot] Rate limited (429). Retrying in ${retryAfter}ms...`);
                await new Promise(r => setTimeout(r, retryAfter));
                return this.safeReply(ctx, text, retryCount + 1);
            }
            console.error('[TelegramBot] Failed to send reply:', err.message);
        }
    }

    async start() {
        if (this.isRunning) return;

        // Try to get token from settings first, then fall back to env
        let token = this.database.getSetting('telegram_bot_token');
        if (!token) {
            token = process.env.TELEGRAM_BOT_TOKEN;
        }

        if (!token) {
            console.warn('[TelegramBot] No bot token found in settings or environment. Telegram integration will be inactive.');
            return;
        }

        try {
            this.bot = new Telegraf(token);

            // Debug logging for all updates
            this.bot.use(async (ctx, next) => {
                console.log(`[TelegramBot] Update received: ${ctx.updateType}`);
                return next();
            });

            // 1. Define command handlers
            const handleStatus = (ctx: any) => {
                const chatId = ctx.chat.id;
                this.safeReply(ctx, `Tunecamp Music Ingester Bot is active!\nChat ID: ${chatId}`);
            };

            const commands: Record<string, (ctx: any) => Promise<any> | any> = {
                'start': handleStatus,
                'status': handleStatus,
                'artists': (ctx) => {
                    const artists = this.database.db.prepare("SELECT name FROM artists ORDER BY name ASC LIMIT 50").all() as { name: string }[];
                    if (artists.length === 0) return this.safeReply(ctx, "No artists found in library.");
                    const list = artists.map(a => `• ${a.name}`).join('\n');
                    return this.safeReply(ctx, `🎨 Artists in Library:\n\n${list}`);
                },
                'albums': (ctx) => {
                    const albums = this.database.db.prepare(`
                        SELECT a.title, ar.name as artist_name 
                        FROM albums a 
                        LEFT JOIN artists ar ON a.artist_id = ar.id 
                        WHERE a.is_release = 0 
                        ORDER BY a.id DESC LIMIT 50
                    `).all() as { title: string, artist_name: string }[];
                    if (albums.length === 0) return this.safeReply(ctx, "No albums found in library.");
                    const list = albums.map(a => `• ${a.artist_name ? a.artist_name + ' - ' : ''}${a.title}`).join('\n');
                    return this.safeReply(ctx, `💿 Recent Library Albums:\n\n${list}`);
                },
                'album': (ctx) => commands['albums'](ctx),
                'releases': (ctx) => {
                    const releases = this.database.db.prepare(`
                        SELECT r.title, ar.name as artist_name 
                        FROM releases r 
                        LEFT JOIN artists ar ON r.artist_id = ar.id 
                        ORDER BY r.id DESC LIMIT 50
                    `).all() as { title: string, artist_name: string }[];
                    if (releases.length === 0) return this.safeReply(ctx, "No releases found.");
                    const list = releases.map(r => `• ${r.artist_name ? r.artist_name + ' - ' : ''}${r.title}`).join('\n');
                    return this.safeReply(ctx, `🚀 Recent Published Releases:\n\n${list}`);
                },
                'release': (ctx) => commands['releases'](ctx),
                'help': (ctx) => {
                    const helpText = `
📖 **Tunecamp Bot Help**

This bot automatically ingests music files shared in this channel.

**Commands:**
• /status - Check bot status and Chat ID
• /artists - List artists in your library
• /albums - List recent library albums
• /releases - List recent published releases
• /rescan - Consolidate library and repair paths
• /help - Show this help message

**How to Import with Metadata:**
1. Send a **Photo** (Album Cover).
2. Add a **Caption** to the photo with these hashtags:
   #artist: Name
   #album: Title
   #year: 2024
3. Send the **Audio File(s)** immediately after.

The bot will automatically associate the photo as the cover and use the hashtags for the library metadata.
                    `;
                    return this.safeReply(ctx, helpText);
                },
                'rescan': async (ctx) => {
                    if (!this.isAuthorized(ctx)) {
                        return this.safeReply(ctx, "⚠️ Unauthorized. Only admins can trigger a rescan.");
                    }
                    await this.safeReply(ctx, "🔍 Starting library consolidation and rescan...");
                    try {
                        const result = await this.scanner.consolidateFiles(this.musicDir);
                        return this.safeReply(ctx, `✅ Rescan complete!\nSuccess: ${result.success}\nFailed: ${result.failed}\nSkipped: ${result.skipped}`);
                    } catch (e) {
                        return this.safeReply(ctx, `❌ Rescan failed: ${e}`);
                    }
                }
            };

            // 2. Define the main update handler
            const handleUpdate = async (ctx: any) => {
                try {
                    const msg = ctx.message || ctx.channelPost;
                    if (!msg) return;

                    const chatId = ctx.chat.id.toString();
                    const chatType = ctx.chat.type;

                    // Handle Commands
                    const text = msg.text || msg.caption;
                    if (text && text.startsWith('/')) {
                        const parts = text.split(' ');
                        const cmdWithBot = parts[0].substring(1);
                        const cmd = cmdWithBot.split('@')[0];
                        
                        if (commands[cmd]) {
                            console.log(`[TelegramBot] Command received in ${chatType} ${chatId}: ${cmd}`);
                            return await commands[cmd](ctx);
                        }
                    }

                    // Handle Photo context
                    if (msg.photo) {
                        if (this.isAuthorized(ctx)) {
                            const photoId = msg.photo[msg.photo.length - 1].file_id;
                            const existing = this.recentContext.get(chatId) || { timestamp: 0 };
                            this.recentContext.set(chatId, {
                                ...existing,
                                photoId,
                                caption: msg.caption || existing.caption,
                                timestamp: Date.now()
                            });
                            console.log(`[TelegramBot] Photo context saved for chat ${chatId}`);
                        }
                        return;
                    }

                    // Handle Text context (for metadata hashtags sent as separate messages)
                    if (msg.text && (msg.text.includes('#artist') || msg.text.includes('#album'))) {
                        if (this.isAuthorized(ctx)) {
                            const existing = this.recentContext.get(chatId) || { timestamp: 0 };
                            this.recentContext.set(chatId, {
                                ...existing,
                                caption: msg.text,
                                timestamp: Date.now()
                            });
                            console.log(`[TelegramBot] Text metadata context saved for chat ${chatId}`);
                        }
                        return;
                    }

                    // Handle Audio files
                    if (msg.audio) {
                        await this.handleAudio(ctx, msg.audio);
                    } else if (msg.document) {
                        const doc = msg.document;
                        if (doc.mime_type?.startsWith('audio/') || 
                            ['.mp3', '.flac', '.wav', '.ogg', '.m4a'].some((ext: string) => doc.file_name?.toLowerCase().endsWith(ext))) {
                            await this.handleAudio(ctx, doc);
                        }
                    }
                } catch (err) {
                    console.error('[TelegramBot] Error in update loop:', err);
                }
            };

            // 3. Register handlers
            this.bot.on('message', handleUpdate);
            this.bot.on('channel_post', handleUpdate);

            await this.bot.launch();
            this.isRunning = true;
            console.log('✅ Telegram Bot started');
            
            // Handle graceful stop
            process.once('SIGINT', () => this.stop());
            process.once('SIGTERM', () => this.stop());
            
        } catch (err) {
            console.error('[TelegramBot] Failed to start:', err);
        }
    }

    async stop() {
        if (!this.bot) return;
        try {
            this.bot.stop('SIGTERM');
            console.log('[TelegramBot] Stopped');
        } catch (e) {
            console.error('[TelegramBot] Error stopping bot:', e);
        }
        this.isRunning = false;
        this.bot = undefined;
    }

    async restart() {
        console.log('[TelegramBot] Restarting with new settings...');
        await this.stop();
        await this.start();
    }

    private isAuthorized(ctx: any): boolean {
        const chatId = ctx.chat?.id?.toString();
        const chatType = ctx.chat?.type; // 'private', 'group', 'supergroup', 'channel'
        const senderId = ctx.from?.id?.toString();
        
        const allowedChannelsSetting = this.database.getSetting('telegram_allowed_channels');
        if (!allowedChannelsSetting) return true; // If no whitelist configured, allow all
        
        const allowed = allowedChannelsSetting.split(',').map(s => s.trim());
        
        if (chatType === 'channel') {
            // In a channel, if the channel itself is whitelisted, we allow commands
            return allowed.includes(chatId);
        } else if (chatType === 'private') {
            return !!(senderId && allowed.includes(senderId));
        } else if (chatType === 'group' || chatType === 'supergroup') {
            // If the chat itself is whitelisted (e.g. linked group), allow anyone in the group
            if (allowed.includes(chatId)) return true;
            // Otherwise, check if the sender is whitelisted
            return !!(senderId && allowed.includes(senderId));
        }
        
        return false;
    }

    private async handleAudio(ctx: any, audio: any) {
        if (!this.isAuthorized(ctx)) {
            const chatType = ctx.chat?.type;
            if (chatType !== 'group' && chatType !== 'supergroup') {
                console.warn(`[TelegramBot] Unauthorized ${chatType} message from chat ${ctx.chat.id}`);
            }
            return;
        }

        // Check for file size limit (20MB for standard Bot API)
        if (audio.file_size && audio.file_size > 20 * 1024 * 1024) {
            const fileName = audio.file_name || audio.title || 'audio file';
            const sizeMB = (audio.file_size / (1024 * 1024)).toFixed(1);
            console.warn(`[TelegramBot] File ${fileName} is too big (${sizeMB}MB)`);
            await this.safeReply(ctx, `⚠️ "${fileName}" is too large (${sizeMB}MB).\n\nTelegram Bots are limited to 20MB per file by the default API. To import larger files, please use the web interface or a local scanner.`);
            return;
        }

            const chatId = ctx.chat.id.toString();
            
            try {
                // Check for recent context (photo/caption/text)
                let suggestedCoverPath: string | undefined;
                let metadataHints: any = {};
                const context = this.recentContext.get(chatId);
                
                // Get caption from current message or recent context
                const msg = ctx.message || ctx.channelPost;
                const currentCaption = msg?.caption || '';
                const contextCaption = (context && (Date.now() - context.timestamp < 60 * 60 * 1000)) ? (context.caption || '') : '';
                
                // Combine captions for parsing (current message takes precedence if we parse sequentially)
                const caption = (currentCaption + '\n' + contextCaption).trim();
                
                if (caption) {
                    console.log(`[TelegramBot] Parsing caption for metadata: ${caption.substring(0, 50)}...`);
                    
                    // Improved regex for metadata tags
                    // Matches #tag: value, #tag - value, #tag = value, or #tag value
                    const artistMatch = caption.match(/#artist[:\s\-=]+([^\n#\r]+)/i);
                    const albumMatch = caption.match(/#album[:\s\-=]+([^\n#\r]+)/i);
                    const yearMatch = caption.match(/#year[:\s\-=]+(\d{4})/i);
                    const titleMatch = caption.match(/#title[:\s\-=]+([^\n#\r]+)/i);
                    const genreMatch = caption.match(/#genre[:\s\-=]+([^\n#\r]+)/i);

                    if (artistMatch) metadataHints.artist = artistMatch[1].trim();
                    if (albumMatch) metadataHints.album = albumMatch[1].trim();
                    if (yearMatch) metadataHints.year = parseInt(yearMatch[1]);
                    if (titleMatch) metadataHints.title = titleMatch[1].trim();
                    if (genreMatch) metadataHints.genre = genreMatch[1].trim();

                    // Fallback to line-based parsing if no hashtags were found
                    if (!metadataHints.artist && !metadataHints.album) {
                        const lines = caption.split('\n').map(l => l.trim()).filter(l => l.length > 0 && !l.startsWith('#'));
                        if (lines.length >= 1) metadataHints.artist = lines[0];
                        if (lines.length >= 2) metadataHints.album = lines[1];
                    }

                    console.log(`[TelegramBot] Extracted metadata hints from caption:`, metadataHints);
                }

                // 2. Download Photo as Cover
                if (context?.photoId) {
                    try {
                        const photoLink = await ctx.telegram.getFileLink(context.photoId);
                        const importDir = path.join(this.musicDir, 'imports', 'telegram');
                        await fs.ensureDir(importDir);
                        const coverPath = path.join(importDir, `cover_${context.photoId}.jpg`);
                        
                        const photoResponse = await axios({ url: photoLink.href, responseType: 'stream', method: 'GET' });
                        const photoWriter = fs.createWriteStream(coverPath);
                        photoResponse.data.pipe(photoWriter);
                        await new Promise<void>((resolve, reject) => {
                            photoWriter.on('finish', () => resolve());
                            photoWriter.on('error', (err) => reject(err));
                        });
                        suggestedCoverPath = coverPath;
                    } catch (e) {
                        console.error('[TelegramBot] Failed to download cover:', e);
                    }
                }

                // 3. Download and Process Audio
                const fileLink = await ctx.telegram.getFileLink(audio.file_id);
                const fileName = audio.file_name || `${audio.file_unique_id}.mp3`;
                const importDir = path.join(this.musicDir, 'imports', 'telegram');
                await fs.ensureDir(importDir);

                const filePath = path.join(importDir, fileName);
                
                await this.safeReply(ctx, `📥 Downloading ${fileName}...`);
                
                const response = await axios({
                    url: fileLink.href,
                    method: 'GET',
                    responseType: 'stream'
                });

                const writer = fs.createWriteStream(filePath);
                response.data.pipe(writer);

                await new Promise<void>((resolve, reject) => {
                    writer.on('finish', () => resolve());
                    writer.on('error', (err) => reject(err));
                });

                await this.safeReply(ctx, `⚙️ Processing ${fileName}...`);
                const result = await this.scanner.processAudioFile(filePath, this.musicDir, undefined, undefined, undefined, suggestedCoverPath, metadataHints);

                if (result?.success) {
                    await this.safeReply(ctx, `✅ UPLOADED TO TUNECAMP!\n\n${result.message}`);
                } else {
                    await this.safeReply(ctx, `❌ Import failed: ${result?.message || 'Unknown error'}`);
                }
            } catch (err) {
                console.error('[TelegramBot] Error handling audio:', err);
                await this.safeReply(ctx, '❌ Error processing audio file. Please check server logs.');
            }
        }
    }
}
