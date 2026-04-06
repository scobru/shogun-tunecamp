declare module 'webtorrent-hybrid' {
  import { Instance } from 'webtorrent';
  const WebTorrent: {
    new (config?: any): Instance;
    (config?: any): Instance;
  };
  export default WebTorrent;
}
