import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import API from '../../services/api';
import type { SiteSettings } from '../../types';
import { Sidebar } from './Sidebar';
import { PlayerBar } from '../player/PlayerBar';
import { AuthModal } from '../modals/AuthModal';
import { PlaylistModal } from '../modals/PlaylistModal';
import { UnlockModal } from '../modals/UnlockModal';
import { ArtistKeysModal } from '../modals/ArtistKeysModal';
import { AdminTrackModal } from '../modals/AdminTrackModal';

export const MainLayout = () => {
    const [bgUrl, setBgUrl] = useState('');

    useEffect(() => {
        API.getSiteSettings().then((s: SiteSettings) => {
            if (s.backgroundImage) setBgUrl(s.backgroundImage);
        }).catch(console.error);
    }, []);

    return (
        <div className="drawer lg:drawer-open h-screen bg-black text-white font-sans overflow-hidden">
            <a
                href="#main-content"
                className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[100] btn btn-primary btn-sm"
            >
                Skip to content
            </a>
            <input id="main-drawer" type="checkbox" className="drawer-toggle" />
            
            {/* Global Background */}
             {bgUrl && (
                 <div 
                     className="absolute inset-0 z-0 opacity-20 bg-cover bg-center pointer-events-none"
                     style={{ backgroundImage: `url(${bgUrl})` }}
                 />
             )}
            
            <div className="drawer-content relative z-10 flex flex-col h-full overflow-hidden">
                {/* Mobile Header */}
                <div className="lg:hidden flex items-center p-4 bg-base-100/90 backdrop-blur-md border-b border-white/5">
                    <label htmlFor="main-drawer" aria-label="Open sidebar" className="btn btn-square btn-ghost mr-2">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="inline-block w-6 h-6 stroke-current"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"></path></svg>
                    </label>
                    <span className="font-bold text-xl">TuneCamp</span>
                </div>

                <main
                    id="main-content"
                    tabIndex={-1}
                    className="flex-1 bg-base-100/90 relative flex flex-col h-full lg:rounded-tl-2xl border-t border-l border-white/5 lg:mr-2 lg:mt-2 lg:mb-24 shadow-2xl overflow-hidden backdrop-blur-3xl focus:outline-none"
                >
                    <div className="flex-1 overflow-y-auto pb-32 scroll-smooth p-6">
                        <Outlet />
                    </div>
                </main>
            </div>

            <div className="drawer-side z-50">
                <label htmlFor="main-drawer" aria-label="close sidebar" className="drawer-overlay"></label>
                <Sidebar />
            </div>

            <PlayerBar />
            
            {/* Global Modals */}
            <AuthModal />
            <PlaylistModal />
            <UnlockModal />
            <ArtistKeysModal />
            <AdminTrackModal onTrackUpdated={() => window.dispatchEvent(new CustomEvent('refresh-admin-tracks'))} />
        </div>
    );
};
