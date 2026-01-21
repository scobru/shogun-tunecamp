// TuneCamp Main Application

const App = {
  isAdmin: false,

  async init() {
    Player.init();
    await this.checkAuth();
    this.setupRouter();
    this.setupEventListeners();
    this.route();
  },

  async checkAuth() {
    try {
      const status = await API.getAuthStatus();
      this.isAdmin = status.authenticated;
      this.updateAuthUI(status);
    } catch (e) {
      console.error('Auth check failed:', e);
    }
  },

  updateAuthUI(status) {
    const btn = document.getElementById('admin-btn');
    if (status.firstRun) {
      btn.textContent = 'Setup Admin';
      btn.classList.add('btn-primary');
    } else if (this.isAdmin) {
      btn.textContent = 'Admin Panel';
      btn.classList.add('btn-primary');
    } else {
      btn.textContent = 'Login';
      btn.classList.remove('btn-primary');
    }
  },

  setupRouter() {
    window.addEventListener('hashchange', () => this.route());
  },

  setupEventListeners() {
    // Admin button
    document.getElementById('admin-btn').addEventListener('click', () => {
      if (this.isAdmin) {
        window.location.hash = '#/admin';
      } else {
        this.showLoginModal();
      }
    });

    // Modal close
    document.getElementById('modal-close').addEventListener('click', () => {
      this.hideModal();
    });

    // Login form
    document.getElementById('login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.handleLogin();
    });

    // Nav links
    document.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', (e) => {
        document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
        e.target.classList.add('active');
      });
    });
  },

  async route() {
    const hash = window.location.hash || '#/';
    const path = hash.slice(1);
    const main = document.getElementById('main-content');

    try {
      if (path === '/' || path === '') {
        await this.renderHome(main);
      } else if (path === '/albums') {
        await this.renderAlbums(main);
      } else if (path.startsWith('/album/')) {
        const id = path.split('/')[2];
        await this.renderAlbum(main, id);
      } else if (path === '/tracks') {
        await this.renderTracks(main);
      } else if (path === '/artists') {
        await this.renderArtists(main);
      } else if (path.startsWith('/artist/')) {
        const id = path.split('/')[2];
        await this.renderArtist(main, id);
      } else if (path === '/search') {
        await this.renderSearch(main);
      } else if (path === '/admin') {
        if (this.isAdmin) {
          await this.renderAdmin(main);
        } else {
          window.location.hash = '#/';
        }
      } else {
        main.innerHTML = '<h1>Not Found</h1>';
      }
    } catch (e) {
      console.error('Route error:', e);
      main.innerHTML = '<div class="error-message">Error loading page</div>';
    }
  },

  // Views
  async renderHome(container) {
    try {
      const catalog = await API.getCatalog();

      container.innerHTML = `
        <section class="section">
          <h1 class="section-title">Welcome to TuneCamp</h1>
          <div class="stats-grid">
            <div class="stat-card">
              <div class="stat-value">${catalog.stats.albums || 0}</div>
              <div class="stat-label">Albums</div>
            </div>
            <div class="stat-card">
              <div class="stat-value">${catalog.stats.tracks || 0}</div>
              <div class="stat-label">Tracks</div>
            </div>
          </div>
        </section>
        <section class="section">
          <div class="section-header">
            <h2 class="section-title">Recent Releases</h2>
            <a href="#/albums" class="btn btn-outline">View All</a>
          </div>
          <div class="grid" id="recent-albums"></div>
        </section>
      `;

      this.renderAlbumGrid(document.getElementById('recent-albums'), catalog.recentAlbums);
    } catch (e) {
      container.innerHTML = '<div class="error-message">Failed to load catalog</div>';
    }
  },

  async renderAlbums(container) {
    const albums = await API.getAlbums();

    container.innerHTML = `
      <section class="section">
        <h1 class="section-title">Albums</h1>
        <div class="grid" id="albums-grid"></div>
      </section>
    `;

    this.renderAlbumGrid(document.getElementById('albums-grid'), albums);
  },

  async renderAlbum(container, idOrSlug) {
    const album = await API.getAlbum(idOrSlug);

    // Build artist link
    const artistLink = album.artist_slug
      ? `<a href="#/artist/${album.artist_slug}" style="color: var(--text-secondary); text-decoration: none;">${album.artist_name || 'Unknown Artist'}</a>`
      : `<span style="color: var(--text-secondary);">${album.artist_name || 'Unknown Artist'}</span>`;

    container.innerHTML = `
      <div class="album-detail">
        <div class="album-header" style="display: flex; gap: 2rem; margin-bottom: 2rem;">
          <img src="${API.getAlbumCoverUrl(album.slug || album.id)}" alt="${album.title}" 
               style="width: 250px; height: 250px; border-radius: 12px; object-fit: cover;">
          <div>
            <h1>${album.title}</h1>
            <p style="margin-bottom: 1rem;">${artistLink}</p>
            ${album.date ? '<p style="color: var(--text-muted);">' + album.date + '</p>' : ''}
            ${album.genre ? '<p style="color: var(--text-muted);">' + album.genre + '</p>' : ''}
            ${album.description ? '<p style="color: var(--text-secondary); margin-top: 1rem; max-width: 500px;">' + album.description + '</p>' : ''}
          </div>
        </div>
        <div class="track-list" id="track-list"></div>
      </div>
    `;

    this.renderTrackList(document.getElementById('track-list'), album.tracks);
  },

  async renderArtists(container) {
    const artists = await API.getArtists();

    container.innerHTML = `
      <section class="section">
        <h1 class="section-title">Artists</h1>
        <div class="grid" id="artists-grid"></div>
      </section>
    `;

    const grid = document.getElementById('artists-grid');
    grid.innerHTML = artists.map(artist => `
      <a href="#/artist/${artist.slug || artist.id}" class="card">
        <div class="card-cover artist-cover-placeholder" data-src="${API.getArtistCoverUrl(artist.slug || artist.id)}">
          <div class="placeholder-icon">👤</div>
        </div>
        <div class="card-body">
          <div class="card-title">${artist.name}</div>
        </div>
      </a>
    `).join('');
    // Load artist images with fallback
    grid.querySelectorAll('.artist-cover-placeholder').forEach(el => {
      const img = new Image();
      img.onload = () => { el.innerHTML = ''; el.style.backgroundImage = `url(${el.dataset.src})`; el.style.backgroundSize = 'cover'; };
      img.onerror = () => { /* keep placeholder */ };
      img.src = el.dataset.src;
    });
  },

  async renderTracks(container) {
    const tracks = await API.getTracks();

    container.innerHTML = `
      <section class="section">
        <h1 class="section-title">All Tracks</h1>
        <div class="track-list" id="all-tracks-list"></div>
      </section>
    `;

    const list = document.getElementById('all-tracks-list');
    if (!tracks || tracks.length === 0) {
      list.innerHTML = '<p style="padding: 1rem; color: var(--text-secondary);">No tracks in library</p>';
      return;
    }

    list.innerHTML = tracks.map((track, index) => `
      <div class="track-item" data-track='${JSON.stringify(track).replace(/'/g, "&apos;")}' data-index="${index}">
        <div class="track-num">${index + 1}</div>
        <div class="track-info">
          <div class="track-title">${track.title}</div>
          <div style="color: var(--text-secondary); font-size: 0.875rem;">
            ${track.artist_name || 'Unknown Artist'}${track.album_title ? ' • ' + track.album_title : ''}
          </div>
        </div>
        <div class="track-duration">${Player.formatTime(track.duration)}</div>
      </div>
    `).join('');

    this.attachTrackListeners(tracks);
  },

  async renderArtist(container, id) {
    const artist = await API.getArtist(id);

    const hasAlbums = artist.albums && artist.albums.length > 0;
    const hasTracks = artist.tracks && artist.tracks.length > 0;

    // Build links HTML
    let linksHtml = '';
    if (artist.links && Array.isArray(artist.links)) {
      const linkIcons = {
        website: '🌐',
        bandcamp: '🎵',
        spotify: '🎧',
        instagram: '📷',
        twitter: '🐦',
        youtube: '▶️',
        soundcloud: '☁️',
        facebook: '📘',
      };

      linksHtml = '<div class="artist-links" style="display: flex; gap: 1rem; margin-bottom: 2rem; flex-wrap: wrap;">';
      for (const linkObj of artist.links) {
        for (const [key, url] of Object.entries(linkObj)) {
          const icon = linkIcons[key] || '🔗';
          const name = key.charAt(0).toUpperCase() + key.slice(1);
          linksHtml += `<a href="${url}" target="_blank" class="btn btn-outline" style="gap: 0.5rem;"><span>${icon}</span> ${name}</a>`;
        }
      }
      linksHtml += '</div>';
    }

    container.innerHTML = `
      <section class="section">
        <div class="artist-header" style="display: flex; gap: 2rem; margin-bottom: 2rem; align-items: flex-start;">
          <div class="artist-cover-placeholder artist-header-cover" data-src="${API.getArtistCoverUrl(artist.slug || artist.id)}">
            <div class="placeholder-icon">👤</div>
          </div>
          <div style="flex: 1;">
            <h1 class="section-title" style="margin-bottom: 0.5rem;">${artist.name}</h1>
            ${artist.bio ? '<p style="color: var(--text-secondary); margin-bottom: 1rem; max-width: 600px;">' + artist.bio + '</p>' : ''}
            ${linksHtml}
          </div>
        </div>
        ${hasAlbums ? '<h2 class="section-title" style="font-size: 1.25rem; margin-bottom: 1rem;">Albums</h2>' : ''}
        <div class="grid" id="artist-albums"></div>
        ${hasTracks ? '<h2 class="section-title" style="font-size: 1.25rem; margin: 2rem 0 1rem;">Tracks</h2>' : ''}
        <div class="track-list" id="artist-tracks"></div>
      </section>
    `;

    // Load artist header image with fallback
    const artistHeaderCover = container.querySelector('.artist-header-cover');
    if (artistHeaderCover) {
      const img = new Image();
      img.onload = () => {
        artistHeaderCover.innerHTML = '';
        artistHeaderCover.style.backgroundImage = `url(${artistHeaderCover.dataset.src})`;
        artistHeaderCover.style.backgroundSize = 'cover';
        artistHeaderCover.style.backgroundPosition = 'center';
      };
      img.onerror = () => { /* keep placeholder */ };
      img.src = artistHeaderCover.dataset.src;
    }

    if (hasAlbums) {
      this.renderAlbumGrid(document.getElementById('artist-albums'), artist.albums);
    } else {
      document.getElementById('artist-albums').innerHTML = '<p style="color: var(--text-secondary);">No albums found</p>';
    }

    if (hasTracks) {
      this.renderTrackList(document.getElementById('artist-tracks'), artist.tracks);
    }
  },

  async renderSearch(container) {
    container.innerHTML = `
      <section class="section">
        <h1 class="section-title">Search</h1>
        <div class="search-container">
          <input type="text" class="search-input" id="search-input" placeholder="Search for albums, artists, or tracks...">
        </div>
        <div id="search-results"></div>
      </section>
    `;

    let timeout;
    document.getElementById('search-input').addEventListener('input', (e) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => this.performSearch(e.target.value), 300);
    });
  },

  async performSearch(query) {
    const results = document.getElementById('search-results');

    if (query.length < 2) {
      results.innerHTML = '';
      return;
    }

    try {
      const data = await API.search(query);

      let html = '';

      if (data.artists.length > 0) {
        html += '<h3 style="margin: 1rem 0;">Artists</h3>';
        html += '<div class="grid">';
        html += data.artists.map(a => `
          <a href="#/artist/${a.id}" class="card">
            <div class="card-cover" style="display: flex; align-items: center; justify-content: center; font-size: 3rem;">👤</div>
            <div class="card-body"><div class="card-title">${a.name}</div></div>
          </a>
        `).join('');
        html += '</div>';
      }

      if (data.albums.length > 0) {
        html += '<h3 style="margin: 1rem 0;">Albums</h3>';
        html += '<div class="grid">';
        html += data.albums.map(a => `
          <a href="#/album/${a.id}" class="card">
            <img src="${API.getAlbumCoverUrl(a.id)}" class="card-cover" alt="${a.title}">
            <div class="card-body">
              <div class="card-title">${a.title}</div>
              <div class="card-subtitle">${a.artist_name || ''}</div>
            </div>
          </a>
        `).join('');
        html += '</div>';
      }

      if (data.tracks.length > 0) {
        html += '<h3 style="margin: 1rem 0;">Tracks</h3>';
        html += '<div class="track-list">';
        data.tracks.forEach((t, i) => {
          html += `
            <div class="track-item" data-track='${JSON.stringify(t).replace(/'/g, "&apos;")}' data-index="${i}">
              <div class="track-info">
                <div class="track-title">${t.title}</div>
                <div style="color: var(--text-secondary); font-size: 0.875rem;">${t.artist_name || ''}</div>
              </div>
              <div class="track-duration">${Player.formatTime(t.duration)}</div>
            </div>
          `;
        });
        html += '</div>';
      }

      if (!html) {
        html = '<p style="color: var(--text-secondary); text-align: center;">No results found</p>';
      }

      results.innerHTML = html;
      this.attachTrackListeners();
    } catch (e) {
      results.innerHTML = '<div class="error-message">Search failed</div>';
    }
  },

  async renderAdmin(container) {
    const [releases, stats] = await Promise.all([
      API.getAdminReleases(),
      API.getAdminStats()
    ]);

    container.innerHTML = `
      <section class="section">
        <div class="admin-header">
          <h1 class="section-title">Admin Panel</h1>
          <div>
            <button class="btn btn-primary" id="new-release-btn">+ New Release</button>
            <button class="btn btn-outline" id="upload-btn">📤 Upload Tracks</button>
            <button class="btn btn-outline" id="rescan-btn">🔄 Rescan</button>
            <button class="btn btn-outline" id="logout-btn">Logout</button>
          </div>
        </div>
        
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-value">${stats.artists}</div>
            <div class="stat-label">Artists</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${stats.albums}</div>
            <div class="stat-label">Albums</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${stats.tracks}</div>
            <div class="stat-label">Tracks</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${stats.publicAlbums}</div>
            <div class="stat-label">Public</div>
          </div>
        </div>
        
        <!-- Upload Panel (hidden by default) -->
        <div id="upload-panel" class="admin-panel" style="display: none;">
          <h3>Upload Tracks to Library</h3>
          <div class="upload-zone" id="upload-zone">
            <input type="file" id="file-input" multiple accept="audio/*" style="display: none;">
            <p>📁 Drag & drop audio files here or <button class="btn btn-outline btn-sm" id="browse-btn">Browse</button></p>
            <p style="font-size: 0.8rem; color: var(--text-muted);">Supports: MP3, FLAC, OGG, WAV, M4A, AAC, OPUS</p>
          </div>
          <div id="upload-progress" style="display: none;">
            <div class="progress-bar"><div class="progress-fill" id="progress-fill"></div></div>
            <p id="upload-status"></p>
          </div>
        </div>

        <!-- New Release Panel (hidden by default) -->
        <div id="release-panel" class="admin-panel" style="display: none;">
          <h3>Create New Release</h3>
          <form id="release-form">
            <div class="form-row">
              <div class="form-group">
                <label>Title *</label>
                <input type="text" id="release-title" required placeholder="Album title">
              </div>
              <div class="form-group">
                <label>Release Date</label>
                <input type="date" id="release-date" value="${new Date().toISOString().split('T')[0]}">
              </div>
            </div>
            <div class="form-group">
              <label>Description</label>
              <textarea id="release-description" rows="3" placeholder="Optional description..."></textarea>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>Genres (comma separated)</label>
                <input type="text" id="release-genres" placeholder="Electronic, Ambient, etc.">
              </div>
              <div class="form-group">
                <label>Download Type</label>
                <select id="release-download">
                  <option value="free">Free Download</option>
                  <option value="paycurtain">Pay What You Want</option>
                  <option value="none">No Download</option>
                </select>
              </div>
            </div>
            <div class="form-actions">
              <button type="submit" class="btn btn-primary">Create Release</button>
              <button type="button" class="btn btn-outline" id="cancel-release">Cancel</button>
            </div>
          </form>
        </div>
        
        <h2 class="section-title" style="font-size: 1.25rem; margin: 2rem 0 1rem;">Manage Releases</h2>
        <div id="releases-list"></div>
      </section>
    `;

    const list = document.getElementById('releases-list');
    list.innerHTML = releases.map(r => `
      <div class="release-row" data-release-id="${r.id}">
        <div class="release-cover-small album-cover-placeholder" data-src="${API.getAlbumCoverUrl(r.id)}">
          <div class="placeholder-icon" style="font-size: 1.5rem;">🎵</div>
        </div>
        <div class="release-info">
          <div class="release-title">${r.title}</div>
          <div class="release-artist">${r.artist_name || 'Unknown Artist'}</div>
        </div>
        <div class="release-actions">
          <button class="btn btn-sm btn-outline upload-to-release" data-slug="${r.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}">+ Add Tracks</button>
          <button class="btn btn-sm btn-outline btn-danger delete-release">🗑️</button>
        </div>
        <div class="release-status">
          <span class="status-badge ${r.is_public ? 'status-public' : 'status-private'}">
            ${r.is_public ? 'Public' : 'Private'}
          </span>
          <label class="toggle">
            <input type="checkbox" ${r.is_public ? 'checked' : ''} data-album-id="${r.id}">
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>
    `).join('');

    // Load release covers with fallback
    list.querySelectorAll('.album-cover-placeholder').forEach(el => {
      const img = new Image();
      img.onload = () => { el.innerHTML = ''; el.style.backgroundImage = `url(${el.dataset.src})`; el.style.backgroundSize = 'cover'; };
      img.onerror = () => { /* keep placeholder */ };
      img.src = el.dataset.src;
    });

    // Toggle visibility handlers
    list.querySelectorAll('input[type="checkbox"]').forEach(input => {
      input.addEventListener('change', async (e) => {
        const id = e.target.dataset.albumId;
        const isPublic = e.target.checked;
        try {
          await API.toggleVisibility(id, isPublic);
          const badge = e.target.closest('.release-row').querySelector('.status-badge');
          badge.className = 'status-badge ' + (isPublic ? 'status-public' : 'status-private');
          badge.textContent = isPublic ? 'Public' : 'Private';
        } catch (err) {
          e.target.checked = !isPublic;
          alert('Failed to update visibility');
        }
      });
    });

    // Delete release handlers
    list.querySelectorAll('.delete-release').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const row = e.target.closest('.release-row');
        const id = row.dataset.releaseId;
        const title = row.querySelector('.release-title').textContent;

        if (confirm(`Delete "${title}"? This will remove all files!`)) {
          try {
            await API.deleteRelease(id);
            row.remove();
          } catch (err) {
            alert('Failed to delete release');
          }
        }
      });
    });

    // Add tracks to release handlers
    list.querySelectorAll('.upload-to-release').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const slug = e.target.dataset.slug;
        this.showUploadToRelease(slug);
      });
    });

    // Upload panel toggle
    document.getElementById('upload-btn').addEventListener('click', () => {
      const panel = document.getElementById('upload-panel');
      panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
      document.getElementById('release-panel').style.display = 'none';
    });

    // New release panel toggle
    document.getElementById('new-release-btn').addEventListener('click', () => {
      const panel = document.getElementById('release-panel');
      panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
      document.getElementById('upload-panel').style.display = 'none';
    });

    document.getElementById('cancel-release').addEventListener('click', () => {
      document.getElementById('release-panel').style.display = 'none';
    });

    // Release form
    document.getElementById('release-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.handleCreateRelease();
    });

    // Upload handlers
    this.setupUploadHandlers();

    // Rescan button
    document.getElementById('rescan-btn').addEventListener('click', async () => {
      const btn = document.getElementById('rescan-btn');
      btn.disabled = true;
      btn.textContent = 'Scanning...';
      try {
        await API.rescan();
        window.location.reload();
      } catch (e) {
        alert('Scan failed');
        btn.disabled = false;
        btn.textContent = '🔄 Rescan';
      }
    });

    // Logout button
    document.getElementById('logout-btn').addEventListener('click', () => {
      API.logout();
      this.isAdmin = false;
      this.checkAuth();
      window.location.hash = '#/';
    });
  },

  setupUploadHandlers() {
    const zone = document.getElementById('upload-zone');
    const input = document.getElementById('file-input');
    const browseBtn = document.getElementById('browse-btn');

    browseBtn.addEventListener('click', () => input.click());

    zone.addEventListener('dragover', (e) => {
      e.preventDefault();
      zone.classList.add('dragover');
    });

    zone.addEventListener('dragleave', () => {
      zone.classList.remove('dragover');
    });

    zone.addEventListener('drop', async (e) => {
      e.preventDefault();
      zone.classList.remove('dragover');
      await this.uploadFiles(e.dataTransfer.files);
    });

    input.addEventListener('change', async (e) => {
      await this.uploadFiles(e.target.files);
    });
  },

  async uploadFiles(files, options = {}) {
    if (files.length === 0) return;

    const progress = document.getElementById('upload-progress');
    const status = document.getElementById('upload-status');
    const fill = document.getElementById('progress-fill');

    progress.style.display = 'block';
    status.textContent = `Uploading ${files.length} file(s)...`;
    fill.style.width = '50%';

    try {
      const result = await API.uploadTracks(files, options);
      fill.style.width = '100%';
      status.textContent = `✅ Uploaded ${result.files.length} file(s)`;

      // Refresh after a short delay
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (err) {
      status.textContent = '❌ Upload failed: ' + err.message;
      fill.style.width = '0%';
    }
  },

  showUploadToRelease(slug) {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = 'audio/*';

    input.addEventListener('change', async (e) => {
      await this.uploadFiles(e.target.files, { releaseSlug: slug });
    });

    input.click();
  },

  async handleCreateRelease() {
    const title = document.getElementById('release-title').value;
    const date = document.getElementById('release-date').value;
    const description = document.getElementById('release-description').value;
    const genresRaw = document.getElementById('release-genres').value;
    const download = document.getElementById('release-download').value;

    const genres = genresRaw ? genresRaw.split(',').map(g => g.trim()).filter(g => g) : [];

    try {
      await API.createRelease({
        title,
        date,
        description: description || undefined,
        genres: genres.length > 0 ? genres : undefined,
        download
      });

      alert('Release created! Add tracks and cover via the release actions.');
      window.location.reload();
    } catch (err) {
      alert('Failed to create release: ' + err.message);
    }
  },

  // Helpers
  renderAlbumGrid(container, albums) {
    if (!albums || albums.length === 0) {
      container.innerHTML = '<p style="color: var(--text-secondary);">No albums found</p>';
      return;
    }

    container.innerHTML = albums.map(album => `
      <a href="#/album/${album.slug || album.id}" class="card">
        <div class="card-cover album-cover-placeholder" data-src="${API.getAlbumCoverUrl(album.slug || album.id)}">
          <div class="placeholder-icon">🎵</div>
        </div>
        <div class="card-body">
          <div class="card-title">${album.title}</div>
          <div class="card-subtitle">${album.artist_name || ''}</div>
        </div>
      </a>
    `).join('');

    // Load album covers with fallback
    container.querySelectorAll('.album-cover-placeholder').forEach(el => {
      const img = new Image();
      img.onload = () => { el.innerHTML = ''; el.style.backgroundImage = `url(${el.dataset.src})`; el.style.backgroundSize = 'cover'; };
      img.onerror = () => { /* keep placeholder */ };
      img.src = el.dataset.src;
    });
  },

  renderTrackList(container, tracks) {
    if (!tracks || tracks.length === 0) {
      container.innerHTML = '<p style="padding: 1rem; color: var(--text-secondary);">No tracks</p>';
      return;
    }

    container.innerHTML = tracks.map((track, index) => `
      <div class="track-item" data-track='${JSON.stringify(track).replace(/'/g, "&apos;")}' data-index="${index}">
        <div class="track-num">${track.track_num || index + 1}</div>
        <div class="track-info">
          <div class="track-title">${track.title}</div>
        </div>
        <div class="track-duration">${Player.formatTime(track.duration)}</div>
      </div>
    `).join('');

    this.attachTrackListeners(tracks);
  },

  attachTrackListeners(allTracks) {
    document.querySelectorAll('.track-item').forEach(item => {
      item.addEventListener('click', () => {
        try {
          const track = JSON.parse(item.dataset.track.replace(/&apos;/g, "'"));
          const index = parseInt(item.dataset.index, 10);

          // Get all tracks in this list
          const tracks = allTracks || Array.from(item.closest('.track-list').querySelectorAll('.track-item'))
            .map(el => JSON.parse(el.dataset.track.replace(/&apos;/g, "'")));

          Player.play(track, tracks, index);
        } catch (e) {
          console.error('Failed to play track:', e);
        }
      });
    });
  },

  // Modal
  async showLoginModal() {
    const status = await API.getAuthStatus();
    const modal = document.getElementById('login-modal');
    const title = document.getElementById('modal-title');
    const body = document.getElementById('modal-body');

    if (status.firstRun) {
      title.textContent = 'Setup Admin Password';
      body.innerHTML = `
        <form id="login-form">
          <div class="form-group">
            <label for="password">Create Admin Password</label>
            <input type="password" id="password" placeholder="Enter password (min 6 chars)" required minlength="6">
          </div>
          <div class="form-group">
            <label for="password-confirm">Confirm Password</label>
            <input type="password" id="password-confirm" placeholder="Confirm password" required>
          </div>
          <button type="submit" class="btn btn-primary btn-block">Create Admin Account</button>
        </form>
        <div id="login-error" class="error-message"></div>
      `;

      document.getElementById('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.handleSetup();
      });
    } else {
      title.textContent = 'Admin Login';
      body.innerHTML = `
        <form id="login-form">
          <div class="form-group">
            <label for="password">Password</label>
            <input type="password" id="password" placeholder="Enter admin password" required>
          </div>
          <button type="submit" class="btn btn-primary btn-block">Login</button>
        </form>
        <div id="login-error" class="error-message"></div>
      `;

      document.getElementById('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.handleLogin();
      });
    }

    modal.classList.add('active');
  },

  hideModal() {
    document.getElementById('login-modal').classList.remove('active');
  },

  async handleLogin() {
    const password = document.getElementById('password').value;
    const error = document.getElementById('login-error');

    try {
      await API.login(password);
      this.isAdmin = true;
      this.hideModal();
      await this.checkAuth();
      window.location.hash = '#/admin';
    } catch (e) {
      error.textContent = 'Invalid password';
    }
  },

  async handleSetup() {
    const password = document.getElementById('password').value;
    const confirm = document.getElementById('password-confirm').value;
    const error = document.getElementById('login-error');

    if (password !== confirm) {
      error.textContent = 'Passwords do not match';
      return;
    }

    if (password.length < 6) {
      error.textContent = 'Password must be at least 6 characters';
      return;
    }

    try {
      await API.setup(password);
      this.isAdmin = true;
      this.hideModal();
      await this.checkAuth();
      window.location.hash = '#/admin';
    } catch (e) {
      error.textContent = 'Setup failed';
    }
  }
};

// Initialize on load
document.addEventListener('DOMContentLoaded', () => App.init());
