import { useState, useRef } from 'react';
import { useAuthStore } from '../../stores/useAuthStore';
import { X, User, Lock, ArrowRight } from 'lucide-react';
import clsx from 'clsx';

export const AuthModal = () => {
    const { login, error } = useAuthStore();
    const [mode, setMode] = useState<'login' | 'register'>('login');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const dialogRef = useRef<HTMLDialogElement>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        try {
            if (mode === 'login') {
                await login(username, password);
                dialogRef.current?.close();
            } else {
                // Register logic (add to store if needed)
                // For now just allow login
                await login(username, password); 
                dialogRef.current?.close();
            }
        } catch (err) {
            // Error handled in store
        } finally {
            setIsLoading(false);
        }
    };



    return (
        <dialog id="auth-modal" ref={dialogRef} className="modal">
            <div className="modal-box bg-base-100 border border-white/5 max-w-sm">
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-2xl font-bold">{mode === 'login' ? 'Welcome Back' : 'Join TuneCamp'}</h2>
                    <form method="dialog">
                        <button className="btn btn-sm btn-circle btn-ghost"><X size={20} /></button>
                    </form>
                </div>

                {/* Tabs */}
                <div className="tabs tabs-boxed bg-base-200 p-1 mb-6">
                    <a className={clsx("tab flex-1 transition-all", mode === 'login' && "tab-active")} onClick={() => setMode('login')}>Login</a>
                    <a className={clsx("tab flex-1 transition-all", mode === 'register' && "tab-active")} onClick={() => setMode('register')}>Register</a>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="form-control">
                        <div className="relative">
                            <User className="absolute left-3 top-3 text-base-content/50" size={18} />
                            <input 
                                type="text" 
                                placeholder="Username" 
                                className="input input-bordered w-full pl-10" 
                                value={username}
                                onChange={e => setUsername(e.target.value)}
                                required
                            />
                        </div>
                    </div>
                    <div className="form-control">
                        <div className="relative">
                            <Lock className="absolute left-3 top-3 text-base-content/50" size={18} />
                            <input 
                                type="password" 
                                placeholder="Password" 
                                className="input input-bordered w-full pl-10" 
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                required
                            />
                        </div>
                    </div>

                    {error && <div className="text-error text-sm text-center">{error}</div>}

                    <button type="submit" className="btn btn-primary w-full gap-2 shadow-lg shadow-primary/20" disabled={isLoading}>
                        {isLoading ? <span className="loading loading-spinner"></span> : <><ArrowRight size={18} /> {mode === 'login' ? 'Login' : 'Create Account'}</>}
                    </button>
                </form>

                <div className="divider">OR</div>

                <div className="collapse collapse-arrow border border-base-300 bg-base-200">
                    <input type="checkbox" /> 
                    <div className="collapse-title text-sm font-medium">
                        Log in with Mastodon
                    </div>
                    <div className="collapse-content"> 
                        <div className="form-control mt-2">
                            <label className="label">
                                <span className="label-text">Instance URL</span>
                            </label>
                            <div className="flex gap-2">
                                <input 
                                    type="text" 
                                    placeholder="mastodon.social" 
                                    className="input input-bordered w-full text-sm" 
                                    id="mastodon-instance"
                                />
                                <button 
                                    className="btn btn-primary"
                                    type="button"
                                    onClick={async () => {
                                        const input = document.getElementById('mastodon-instance') as HTMLInputElement;
                                        const instance = input.value.trim();
                                        if(!instance) return;
                                        
                                        setIsLoading(true);
                                        try {
                                            const redirectUri = window.location.origin + '/auth/callback';
                                            // Save instance for callback verification
                                            localStorage.setItem('mastodon_instance', instance);
                                            
                                            const { authUrl } = await import('../../services/api').then(m => m.default.mastodonInit(instance, redirectUri));
                                            window.location.href = authUrl;
                                        } catch(e: any) {
                                            console.error(e);
                                            setIsLoading(false);
                                            // Handle error UI if needed
                                            alert(e.message);
                                        }
                                    }}
                                    disabled={isLoading}
                                >
                                    Go
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <form method="dialog" className="modal-backdrop">
               <button>close</button>
            </form>
        </dialog>
    );
};
