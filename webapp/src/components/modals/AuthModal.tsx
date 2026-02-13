import { useState, useRef, useEffect } from 'react';
import { useAuthStore } from '../../stores/useAuthStore';
import API from '../../services/api';
import { LogIn, UserPlus, Shield } from 'lucide-react';
import { match } from 'ts-pattern';

export const AuthModal = () => {
    const dialogRef = useRef<HTMLDialogElement>(null);
    const [mode, setMode] = useState<'admin' | 'user' | 'register' | 'setup'>('admin');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPass, setConfirmPass] = useState('');
    const { login, register, loginAdmin, checkAdminAuth, error, clearError, isFirstRun } = useAuthStore();
    const [localError, setLocalError] = useState('');
    const [showSetupOffer, setShowSetupOffer] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        const handleOpen = () => {
            dialogRef.current?.showModal();
            if (isFirstRun) {
                setMode('admin'); // Stay in admin tab but show offer
                setShowSetupOffer(true);
            } else {
                setMode('user'); 
                setShowSetupOffer(false);
            }
            clearError();
            setLocalError('');
        };
        document.addEventListener('open-auth-modal', handleOpen);
        return () => document.removeEventListener('open-auth-modal', handleOpen);
    }, [isFirstRun]);

    const switchMode = (newMode: 'admin' | 'user' | 'register' | 'setup') => {
        setMode(newMode);
        clearError();
        setLocalError('');
        setShowSetupOffer(false);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLocalError('');
        clearError();
        setIsLoading(true);
        
        try {
            await match(mode)
                .with('register', async () => {
                    if (password !== confirmPass) {
                        throw new Error('Passwords do not match');
                    }
                    await register(username, password);
                })
                .with('admin', () => loginAdmin(username, password))
                .otherwise(() => login(username, password));

            // Close on success
            dialogRef.current?.close();
            setUsername('');
            setPassword('');
            setConfirmPass('');
        } catch (err: any) {
            if (err.message === 'Passwords do not match') {
                setLocalError('Passwords do not match');
            }
            // Error managed by store usually, but set local if needed
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <dialog id="auth-modal" className="modal" ref={dialogRef}>
            <div className="modal-box bg-base-100 border border-white/5 max-w-sm">
                <form method="dialog">
                    <button className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2" aria-label="Close">✕</button>
                </form>
                
                <h3 className="font-bold text-lg mb-6 flex items-center gap-2">
                    {match(mode)
                        .with('register', () => <><UserPlus size={20}/> Create Account</>)
                        .with('setup', () => <><Shield size={20}/> Create First Admin</>)
                        .with('admin', () => <><LogIn size={20}/> Admin Login</>)
                        .otherwise(() => <><LogIn size={20}/> Community Login</>)
                    }
                </h3>

                <div className="tabs tabs-boxed bg-base-200 p-1 mb-6" role="tablist">
                    <button 
                        className={`tab flex-1 ${mode === 'user' ? 'tab-active' : ''}`}
                        onClick={() => switchMode('user')}
                        role="tab"
                        aria-selected={mode === 'user'}
                    >User</button>
                    <button 
                        className={`tab flex-1 ${mode === 'register' ? 'tab-active' : ''}`}
                        onClick={() => switchMode('register')}
                        role="tab"
                        aria-selected={mode === 'register'}
                    >Register</button>
                    <button 
                        className={`tab flex-1 ${mode === 'admin' ? 'tab-active' : ''}`}
                        onClick={() => switchMode('admin')}
                        role="tab"
                        aria-selected={mode === 'admin'}
                    >Admin</button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="form-control">
                        <label className="label">
                            <span className="label-text">Username</span>
                        </label>
                        <input 
                            type="text" 
                            placeholder="username" 
                            className="input input-bordered w-full" 
                            value={username}
                            onChange={e => setUsername(e.target.value)}
                            required
                            autoComplete="username"
                        />
                    </div>

                    <div className="form-control">
                        <label className="label">
                            <span className="label-text">Password</span>
                        </label>
                        <input 
                            type="password" 
                            placeholder="••••••" 
                            className="input input-bordered w-full" 
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            required
                            autoComplete={mode === 'register' ? "new-password" : "current-password"}
                        />
                    </div>
                    
                    {mode === 'register' && (
                        <div className="form-control">
                            <label className="label">
                                <span className="label-text">Confirm Password</span>
                            </label>
                            <input 
                                type="password" 
                                placeholder="••••••" 
                                className="input input-bordered w-full" 
                                value={confirmPass}
                                onChange={e => setConfirmPass(e.target.value)}
                                required
                                autoComplete="new-password"
                            />
                        </div>
                    )}

                    {(error || localError) && (
                        <div className="text-error text-sm text-center">{localError || error}</div>
                    )}

                    {showSetupOffer && (
                        <p className="text-sm opacity-80 text-center">
                            No admin account yet. Create the first admin with the credentials above.
                        </p>
                    )}
                    {showSetupOffer ? (
                        <button
                            type="button"
                            className="btn btn-primary w-full mt-2"
                            disabled={isLoading}
                            onClick={async () => {
                                setLocalError('');
                                setIsLoading(true);
                                try {
                                    const result = await API.setup(username, password);
                                    API.setToken(result.token);
                                    await checkAdminAuth();
                                    dialogRef.current?.close();
                                    setUsername('');
                                    setPassword('');
                                    setShowSetupOffer(false);
                                } catch (e: any) {
                                    setLocalError(e?.message ?? 'Setup failed');
                                } finally {
                                    setIsLoading(false);
                                }
                            }}
                        >
                            {isLoading ? (
                                <span className="loading loading-spinner loading-sm"></span>
                            ) : (
                                'Create Admin Account'
                            )}
                        </button>
                    ) : (
                        <button type="submit" className="btn btn-primary w-full mt-2" disabled={isLoading}>
                            {isLoading ? (
                                <span className="loading loading-spinner loading-sm"></span>
                            ) : (
                                match(mode)
                                    .with('register', () => 'Sign Up')
                                    .with('setup', () => 'Create Admin')
                                    .otherwise(() => 'Sign In')
                            )}
                        </button>
                    )}
                </form>
            </div>

            <form method="dialog" className="modal-backdrop">
                <button>close</button>
            </form>
        </dialog>
    );
};
