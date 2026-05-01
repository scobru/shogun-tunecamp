import { Telegraf } from 'telegraf';
import path from 'path';
import fs from 'fs-extra';
import axios from 'axios';
import { ScannerService } from '../scanner.js';
import { DatabaseService } from '../database.js';

export class TelegramBotService {
    private bot?: Telegraf;
    private isRunning = false;

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

            this.bot.on('audio', handleUpdate);
            this.bot.on('document', handleUpdate);
            this.bot.on('channel_post', handleUpdate);

            // Welcome/Info
            const handleStatus = (ctx: any) => {
                const chatId = ctx.chat.id;
                ctx.reply(`Tunecamp Music Ingester Bot is active!\nChat ID: ${chatId}`);
            };

            this.bot.command('start', handleStatus);
            this.bot.command('status', handleStatus);
            
            // Explicitly handle commands in channel posts
            this.bot.on('channel_post', async (ctx, next) => {
                const post = ctx.channelPost as any;
                if (post && (post.text === '/status' || post.text === '/status@' + ctx.botInfo.username)) {
                    return handleStatus(ctx);
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
            const result = await this.scanner.processAudioFile(filePath, this.musicDir);

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
