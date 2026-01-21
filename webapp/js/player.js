// TuneCamp Audio Player Controller

const Player = {
    audio: null,
    queue: [],
    currentIndex: -1,
    isPlaying: false,

    init() {
        this.audio = document.getElementById('audio-element');
        this.setupEvents();
        this.loadVolume();
    },

    setupEvents() {
        const playBtn = document.getElementById('play-btn');
        const prevBtn = document.getElementById('prev-btn');
        const nextBtn = document.getElementById('next-btn');
        const progressBar = document.getElementById('progress-bar');
        const volumeBar = document.getElementById('volume-bar');

        playBtn.addEventListener('click', () => this.togglePlay());
        prevBtn.addEventListener('click', () => this.prev());
        nextBtn.addEventListener('click', () => this.next());

        progressBar.addEventListener('input', (e) => {
            if (this.audio.duration) {
                this.audio.currentTime = (e.target.value / 100) * this.audio.duration;
            }
        });

        volumeBar.addEventListener('input', (e) => {
            this.audio.volume = e.target.value / 100;
            localStorage.setItem('tunecamp_volume', e.target.value);
        });

        this.audio.addEventListener('timeupdate', () => this.updateProgress());
        this.audio.addEventListener('ended', () => this.next());
        this.audio.addEventListener('play', () => this.updatePlayButton(true));
        this.audio.addEventListener('pause', () => this.updatePlayButton(false));
    },

    loadVolume() {
        const saved = localStorage.getItem('tunecamp_volume');
        if (saved) {
            document.getElementById('volume-bar').value = saved;
            this.audio.volume = saved / 100;
        }
    },

    play(track, queue, index) {
        this.queue = queue || [track];
        this.currentIndex = index || 0;
        this.loadTrack(track);
        this.audio.play();
    },

    loadTrack(track) {
        this.audio.src = API.getStreamUrl(track.id);

        document.getElementById('player-title').textContent = track.title;
        document.getElementById('player-artist').textContent = track.artist_name || '';

        const cover = document.getElementById('player-cover');
        const icon = cover.querySelector('.player-cover-icon');
        if (track.album_id) {
            const coverUrl = API.getAlbumCoverUrl(track.album_id);
            const img = new Image();
            img.onload = () => {
                cover.style.backgroundImage = `url(${coverUrl})`;
                cover.style.backgroundSize = 'cover';
                cover.style.backgroundPosition = 'center';
                if (icon) icon.style.display = 'none';
            };
            img.onerror = () => {
                cover.style.backgroundImage = '';
                if (icon) icon.style.display = 'block';
            };
            img.src = coverUrl;
        } else {
            cover.style.backgroundImage = '';
            if (icon) icon.style.display = 'block';
        }
    },

    togglePlay() {
        if (this.audio.paused) {
            this.audio.play();
        } else {
            this.audio.pause();
        }
    },

    prev() {
        if (this.currentIndex > 0) {
            this.currentIndex--;
            this.loadTrack(this.queue[this.currentIndex]);
            this.audio.play();
        }
    },

    next() {
        if (this.currentIndex < this.queue.length - 1) {
            this.currentIndex++;
            this.loadTrack(this.queue[this.currentIndex]);
            this.audio.play();
        }
    },

    updateProgress() {
        const current = this.audio.currentTime;
        const duration = this.audio.duration || 0;

        document.getElementById('progress-bar').value = duration ? (current / duration) * 100 : 0;
        document.getElementById('current-time').textContent = this.formatTime(current);
        document.getElementById('total-time').textContent = this.formatTime(duration);
    },

    updatePlayButton(playing) {
        const btn = document.getElementById('play-btn');
        btn.textContent = playing ? '⏸' : '▶';
        this.isPlaying = playing;
    },

    formatTime(seconds) {
        if (!seconds || isNaN(seconds)) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return mins + ':' + (secs < 10 ? '0' : '') + secs;
    }
};
