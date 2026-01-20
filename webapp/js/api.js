// TuneCamp API Client

const API = {
    token: localStorage.getItem('tunecamp_token'),

    setToken(token) {
        this.token = token;
        if (token) {
            localStorage.setItem('tunecamp_token', token);
        } else {
            localStorage.removeItem('tunecamp_token');
        }
    },

    getHeaders() {
        const headers = { 'Content-Type': 'application/json' };
        if (this.token) {
            headers['Authorization'] = 'Bearer ' + this.token;
        }
        return headers;
    },

    async get(endpoint) {
        const res = await fetch('/api' + endpoint, {
            headers: this.getHeaders()
        });
        if (!res.ok) throw new Error(await res.text());
        return res.json();
    },

    async post(endpoint, data) {
        const res = await fetch('/api' + endpoint, {
            method: 'POST',
            headers: this.getHeaders(),
            body: JSON.stringify(data)
        });
        if (!res.ok) throw new Error(await res.text());
        return res.json();
    },

    async put(endpoint, data) {
        const res = await fetch('/api' + endpoint, {
            method: 'PUT',
            headers: this.getHeaders(),
            body: JSON.stringify(data)
        });
        if (!res.ok) throw new Error(await res.text());
        return res.json();
    },

    async delete(endpoint) {
        const res = await fetch('/api' + endpoint, {
            method: 'DELETE',
            headers: this.getHeaders()
        });
        if (!res.ok) throw new Error(await res.text());
        return res.json();
    },

    // Auth
    async getAuthStatus() {
        return this.get('/auth/status');
    },

    async login(password) {
        const result = await this.post('/auth/login', { password });
        this.setToken(result.token);
        return result;
    },

    async setup(password) {
        const result = await this.post('/auth/setup', { password });
        this.setToken(result.token);
        return result;
    },

    async logout() {
        this.setToken(null);
    },

    // Catalog
    async getCatalog() {
        return this.get('/catalog');
    },

    async search(query) {
        return this.get('/catalog/search?q=' + encodeURIComponent(query));
    },

    // Albums
    async getAlbums() {
        return this.get('/albums');
    },

    async getAlbum(id) {
        return this.get('/albums/' + id);
    },

    getAlbumCoverUrl(id) {
        return '/api/albums/' + id + '/cover';
    },

    // Artists
    async getArtists() {
        return this.get('/artists');
    },

    async getArtist(id) {
        return this.get('/artists/' + id);
    },

    // Tracks
    async getTracks() {
        return this.get('/tracks');
    },

    getStreamUrl(id) {
        return '/api/tracks/' + id + '/stream';
    },

    // Admin
    async getAdminReleases() {
        return this.get('/admin/releases');
    },

    async toggleVisibility(id, isPublic) {
        return this.put('/admin/releases/' + id + '/visibility', { isPublic });
    },

    async rescan() {
        return this.post('/admin/scan', {});
    },

    async getAdminStats() {
        return this.get('/admin/stats');
    }
};
