const API_URL = 'https://api.poolsidefm.workers.dev/v1/get_tracks_by_playlist';

class PoolsuiteClient {
  constructor() {
    this.playlists = [];
  }

  async fetchTracks() {
    const res = await fetch(API_URL);
    if (!res.ok) throw new Error(`API returned ${res.status}`);

    const data = await res.json();
    this.playlists = this.extractPlaylists(data);
    console.log(`Found ${this.playlists.length} channels`);
    return this.playlists;
  }

  extractPlaylists(data) {
    if (!data.payload?.length) return [];

    return data.payload.map(playlist => {
      const tracks = (playlist.tracks_in_order || [])
        .map(t => this.normalizeTrack(t))
        .filter(t => t?.url?.includes('soundcloud.com'));

      return {
        name: playlist.name || 'Unknown',
        slug: playlist.slug || 'unknown',
        tracks,
        trackCount: tracks.length,
        durationMs: tracks.reduce((sum, t) => sum + t.duration, 0)
      };
    });
  }

  normalizeTrack(track) {
    const url = track.permalink_url || track.soundcloud_permalink || track.url;
    if (!url) return null;

    return {
      id: track.soundcloud_id || track.id || Math.random().toString(36).slice(2, 11),
      title: track.title || track.name || 'Unknown Track',
      artist: track.artist || track.user?.username || track.username || 'Unknown Artist',
      url,
      duration: track.duration_ms || track.duration || 0,
      artwork: track.artwork_url || track.waveform_url || null
    };
  }

  getChannels() {
    return this.playlists.map(p => ({
      name: p.name,
      slug: p.slug,
      trackCount: p.trackCount,
      durationHours: (p.durationMs / 1000 / 60 / 60).toFixed(1)
    }));
  }
}

module.exports = PoolsuiteClient;
