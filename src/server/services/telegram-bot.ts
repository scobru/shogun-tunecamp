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

            // Handle both messages and channel posts
            const handleUpdate = async (ctx: any) => {
                const msg = ctx.message || ctx.channelPost;
                if (!msg) return;

                const chatId = ctx.chat.id.toString();

                // If it's a photo, store it as context for the next audio file
                if (msg.photo) {
                    const photoId = msg.photo[msg.photo.length - 1].file_id;
                    this.recentContext.set(chatId, {
                        photoId,
                        caption: msg.caption,
                        timestamp: Date.now()
                    });
                    console.log(`[TelegramBot] Photo context saved for chat ${chatId}`);
                    return;
                }

                if (msg.audio) {
                    await this.handleAudio(ctx, msg.audio);
                } else if (msg.document) {
                    const doc = msg.document;
                    if (doc.mime_type?.startsWith('audio/') || 
                        ['.mp3', '.flac', '.wav', '.ogg', '.m4a'].some((ext: string) => doc.file_name?.toLowerCase().endsWith(ext))) {
                        await this.handleAudio(ctx, doc);
                    }
                }
            };

            this.bot.on('photo', handleUpdate);
            this.bot.on('audio', handleUpdate);
            this.bot.on('document', handleUpdate);
            this.bot.on('channel_post', handleUpdate);

            // Welcome/Info helper
            const handleStatus = (ctx: any) => {
                const chatId = ctx.chat.id;
                ctx.reply(`Tunecamp Music Ingester Bot is active!\nChat ID: ${chatId}`);
            };

            // Command handlers
            const commands: Record<string, (ctx: any) => Promise<any> | any> = {
                'start': handleStatus,
                'status': handleStatus,
                'artists': (ctx) => {
                    const artists = this.database.db.prepare("SELECT name FROM artists ORDER BY name ASC LIMIT 50").all() as { name: string }[];
                    if (artists.length === 0) return ctx.reply("No artists found in library.");
                    const list = artists.map(a => `• ${a.name}`).join('\n');
                    return ctx.reply(`🎨 Artists in Library:\n\n${list}`);
                },
                'albums': (ctx) => {
                    const albums = this.database.db.prepare("SELECT title FROM releases ORDER BY id DESC LIMIT 50").all() as { title: string }[];
                    if (albums.length === 0) return ctx.reply("No albums found in library.");
                    const list = albums.map(a => `• ${a.title}`).join('\n');
                    return ctx.reply(`💿 Recent Albums:\n\n${list}`);
                },
                'rescan': async (ctx) => {
                    await ctx.reply("🔍 Starting library consolidation and rescan...");
                    try {
                        const result = await this.scanner.consolidateFiles(this.musicDir);
                        return ctx.reply(`✅ Rescan complete!\nSuccess: ${result.success}\nFailed: ${result.failed}\nSkipped: ${result.skipped}`);
                    } catch (e) {
                        return ctx.reply(`❌ Rescan failed: ${e}`);
                    }
                }
            };

            // Register commands for private messages
            for (const [cmd, handler] of Object.entries(commands)) {
                this.bot.command(cmd, handler);
            }
            
            // Explicitly handle commands in channel posts
            this.bot.on('channel_post', async (ctx, next) => {
                const post = ctx.channelPost as any;
                if (post && post.text && post.text.startsWith('/')) {
                    const parts = post.text.split(' ');
                    const cmdWithBot = parts[0].substring(1);
                    const cmd = cmdWithBot.split('@')[0];
                    
                    if (commands[cmd]) {
                        return commands[cmd](ctx);
                    }
                }
                return next();
            });

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

    private async handleAudio(ctx: any, audio: any) {
        const chatId = ctx.chat.id.toString();
        const allowedChannels = this.database.getSetting('telegram_allowed_channels');
        
        if (allowedChannels) {
            const allowed = allowedChannels.split(',').map(s => s.trim());
            const senderId = ctx.from?.id?.toString();
            
            if (!allowed.includes(chatId) && (!senderId || !allowed.includes(senderId))) {
                console.warn(`[TelegramBot] Unauthorized message from chat ${chatId} (sender ${senderId})`);
                return;
            }
        }

        try {
            // Check for recent context (photo/caption)
            let suggestedCoverPath: string | undefined;
            let metadataHints: any = {};
            const context = this.recentContext.get(chatId);
            
            // If context is recent (last 10 minutes)
            if (context && (Date.now() - context.timestamp < 10 * 60 * 1000)) {
                console.log(`[TelegramBot] Using recent photo/caption context for audio`);
                
                // 1. Parse Caption for Hashtags or lines
                if (context.caption) {
                    const caption = context.caption;
                    
                    // Look for hashtags like #artist: Name or #album: Name
                    const artistMatch = caption.match(/#artist[:\s]+([^\n#]+)/i);
                    const albumMatch = caption.match(/#album[:\s]+([^\n#]+)/i);
                    const yearMatch = caption.match(/#year[:\s]+(\d{4})/i);

                    if (artistMatch) metadataHints.artist = artistMatch[1].trim();
                    if (albumMatch) metadataHints.album = albumMatch[1].trim();
                    if (yearMatch) metadataHints.year = parseInt(yearMatch[1]);

                    // Fallback to line-based if no hashtags found
                    if (!metadataHints.artist || !metadataHints.album) {
                        const lines = caption.split('\n').map(l => l.trim()).filter(l => l.length > 0 && !l.startsWith('#'));
                        if (!metadataHints.artist && lines.length >= 1) metadataHints.artist = lines[0];
                        if (!metadataHints.album && lines.length >= 2) metadataHints.album = lines[1];
                        if (!metadataHints.year && lines.length >= 3) {
                            const yMatch = lines[2].match(/\d{4}/);
                            if (yMatch) metadataHints.year = parseInt(yMatch[0]);
                        }
                    }
                }

                // 2. Download Photo as Cover
                if (context.photoId) {
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
            }

            const fileLink = await ctx.telegram.getFileLink(audio.file_id);
            const fileName = audio.file_name || `${audio.file_unique_id}.mp3`;
            const importDir = path.join(this.musicDir, 'imports', 'telegram');
            await fs.ensureDir(importDir);

            const filePath = path.join(importDir, fileName);
            
            await ctx.reply(`📥 Downloading ${fileName}...`);
            
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

            await ctx.reply(`⚙️ Processing ${fileName}...`);
            const result = await this.scanner.processAudioFile(filePath, this.musicDir, undefined, undefined, undefined, suggestedCoverPath, metadataHints);

            if (result?.success) {
                await ctx.reply(`✅ UPLOADED TO TUNECAMP!\n\n${result.message}`);
            } else {
                await ctx.reply(`❌ Import failed: ${result?.message || 'Unknown error'}`);
            }
        } catch (err) {
            console.error('[TelegramBot] Error handling audio:', err);
            await ctx.reply('❌ Error processing audio file. Please check server logs.');
        }
    }
}
