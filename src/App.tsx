import { useState, useEffect, useRef } from 'react';
import { initializeApp, getApps } from 'firebase/app';
import { 
  getFirestore, 
  doc, 
  onSnapshot, 
  setDoc, 
  updateDoc 
} from 'firebase/firestore';
import { 
  getAuth, 
  signInAnonymously,
  onAuthStateChanged, 
  type User
} from 'firebase/auth';
import { 
  Heart, 
  Crown,
  Smartphone,
  Play, 
  CheckCircle, 
  Award, 
  Plus, 
  Trash2, 
  Volume2, 
  VolumeX, 
  Sparkles, 
  Users, 
  ChevronRight, 
  Lock, 
  Unlock, 
  RotateCcw,
  Trophy,
  Eye,
  EyeOff,
  RefreshCw
} from 'lucide-react';
import type { GameState, PlayerRole, VoteChoice } from './types.tsx';

// Default Questions Dataset
const DEFAULT_QUESTIONS = [
  { id: 'q1', text: 'Who is more likely to lose their keys or phone?' },
  { id: 'q2', text: 'Who is more likely to initiate an argument during a trip?' },
  { id: 'q3', text: 'Who is more likely to spend money on spontaneous shopping?' },
  { id: 'q4', text: 'Who is more likely to fall asleep 10 minutes into a movie?' },
  { id: 'q5', text: 'Who is more likely to get lost even with GPS navigation?' },
  { id: 'q6', text: 'Who is more likely to cry during a romantic movie or speech?' },
  { id: 'q7', text: 'Who is more likely to burn dinner when trying a new recipe?' },
  { id: 'q8', text: 'Who is more likely to survive on a deserted island?' },
];

const firebaseConfig = {
  apiKey: "AIzaSyD9VH2tFt8LAavrXrljqoTflBTIpiBNpSE",
  authDomain: "pre-wedding-party-de9be.firebaseapp.com",
  projectId: "pre-wedding-party-de9be",
  storageBucket: "pre-wedding-party-de9be.firebasestorage.app",
  messagingSenderId: "826101642032",
  appId: "1:826101642032:web:8ef0ee73b1246d6b248ef5"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const auth = getAuth(app);
const db = getFirestore(app);

// App ID and Role from URL Query Parameters
const urlParams = new URLSearchParams(window.location.search);
const appId = urlParams.get('appId') || 'pre_wedding_party_game';
const role = urlParams.get('role') || 'PLAYER'; // Default role

// Confetti Component for TV Reveal
const CanvasConfetti = ({ trigger }: { trigger: boolean }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!trigger) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const particles = Array.from({ length: 80 }).map(() => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height - canvas.height,
      size: Math.random() * 8 + 4,
      color: ['#f43f5e', '#fbbf24', '#3b82f6', '#ec4899', '#10b981'][Math.floor(Math.random() * 5)],
      speedY: Math.random() * 3 + 2,
      speedX: Math.random() * 2 - 1,
      rotation: Math.random() * 360,
    }));

    let animationFrameId: number;
    const render = () => {
      if (!ctx) {
        return;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach((p) => {
        p.y += p.speedY;
        p.x += p.speedX;
        p.rotation += 2;
        if (p.y > canvas.height) p.y = -10;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        ctx.restore();
      });
      animationFrameId = requestAnimationFrame(render);
    };

    render();

    const timer = setTimeout(() => {
      cancelAnimationFrame(animationFrameId);
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    }, 6000);

    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(animationFrameId);
    };
  }, [trigger]);

  return <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none z-50" />;
};

export default function App() {
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [user, setUser] = useState<User | null>(null);

  // App Session state
  const sessionCode = appId;
  const [playerName, setPlayerName] = useState(() => localStorage.getItem('wedding_player_name') || '');
  const [playerRole, setPlayerRole] = useState<PlayerRole>(() => localStorage.getItem('wedding_player_role') as PlayerRole || 'GUEST'); // 'GUEST', 'BRIDE', 'GROOM'
  const [playerId] = useState(() => {
    let stored = localStorage.getItem('wedding_player_id');
    if (!stored) {
      stored = 'player_' + Math.random().toString(36).substring(2, 9);
      localStorage.setItem('wedding_player_id', stored);
    }
    return stored;
  });

  // Global Game State (Synced via Firestore)
  const [gameState, setGameState] = useState<GameState>({
    status: 'LOBBY', // 'LOBBY', 'QUESTION_SHOW', 'VOTING_OPEN', 'VOTING_CLOSED', 'REVEAL', 'GAME_OVER'
    currentQuestionIndex: 0,
    questions: DEFAULT_QUESTIONS,
    players: {},
    votes: {},
    coupleChoices: {},
    groomName: 'Groom',
    brideName: 'Bride',
  });

  // 1. Firebase Authentication Setup
  useEffect(() => {
    const initAuth = async () => {
      try {
        await signInAnonymously(auth);
      } catch (err) {
        console.error("Auth error:", err);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  // 2. Real-time Firestore State Listener (Single Source of Truth across all devices)
  useEffect(() => {
    if (!user) return;

    // Fixed path following strict rules for public game state
    const gameDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'party_game', sessionCode);

    const unsubscribeDoc = onSnapshot(gameDocRef, (docSnap) => {
      if (docSnap.exists()) {
        setGameState(docSnap.data() as GameState);
      } else {
        // Initialize room doc if it doesn't exist yet
        const initialState = {
          status: 'LOBBY',
          currentQuestionIndex: 0,
          questions: DEFAULT_QUESTIONS,
          players: {},
          votes: {},
          coupleChoices: {},
          groomName: 'Groom',
          brideName: 'Bride',
        };
        setDoc(gameDocRef, initialState).catch(console.error);
      }
    }, (error) => {
      console.error("Firestore snapshot error:", error);
    });

    return () => unsubscribeDoc();
  }, [user]);

  // Audio Synth Effects
  const playAudioEffect = (type: 'tick' | 'reveal') => {
    if (!soundEnabled) return;
    try {
      const AudioCtx = window.AudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === 'tick') {
        osc.frequency.value = 600;
        gain.gain.setValueAtTime(0.05, ctx.currentTime);
        osc.start();
        osc.stop(ctx.currentTime + 0.05);
      } else if (type === 'reveal') {
        osc.frequency.setValueAtTime(300, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.3);
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        osc.start();
        osc.stop(ctx.currentTime + 0.3);
      }
    } catch (e) {
      // Audio handle fallback
    }
  };

  // Helper to push updates to Firestore
  const updateGlobalGameState = async (updates: Partial<GameState>) => {
    if (!user) return;
    try {
      const gameDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'party_game', sessionCode);
      await updateDoc(gameDocRef, updates);
    } catch (e) {
      // Fallback setDoc if document missing
      const gameDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'party_game', sessionCode);
      await setDoc(gameDocRef, updates, { merge: true });
    }
  };

  // Register Player Locally & in Firestore
  const handleRegisterPlayer = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!playerName.trim()) return;
    localStorage.setItem('wedding_player_name', playerName.trim());
    localStorage.setItem('wedding_player_role', playerRole);

    const updatedPlayers = {
      ...gameState.players,
      [playerId]: {
        name: playerName.trim(),
        role: playerRole,
        score: gameState.players[playerId]?.score || 0,
      },
    };

    updateGlobalGameState({ players: updatedPlayers });
  };

  // Cast Vote (Player or Bride/Groom)
  const handleCastVote = (choice: VoteChoice) => {
    if (gameState.status !== 'VOTING_OPEN') return;

    const currentQ = gameState.questions[gameState.currentQuestionIndex];
    if (!currentQ) return;

    const currentVotesForQ = gameState.votes[currentQ.id] || {};
    const updatedQVotes = {
      ...currentVotesForQ,
      [playerId]: choice,
    };

    const updatedVotes = {
      ...gameState.votes,
      [currentQ.id]: updatedQVotes,
    };

    const currentCoupleChoices = gameState.coupleChoices[currentQ.id] || {};
    let updatedCoupleChoicesForQ = { ...currentCoupleChoices };

    if (playerRole === 'BRIDE') {
      updatedCoupleChoicesForQ.brideChoice = choice;
    } else if (playerRole === 'GROOM') {
      updatedCoupleChoicesForQ.groomChoice = choice;
    }

    const updatedCoupleChoices = {
      ...gameState.coupleChoices,
      [currentQ.id]: updatedCoupleChoicesForQ,
    };

    const updatedPlayers = {
      ...gameState.players,
      [playerId]: {
        name: playerName || 'Guest',
        role: playerRole,
        score: gameState.players[playerId]?.score || 0,
      },
    };

    updateGlobalGameState({
      votes: updatedVotes,
      coupleChoices: updatedCoupleChoices,
      players: updatedPlayers,
    });

    playAudioEffect('tick');
  };

  // Host Stage Controller Steps
  const hostNextStep = () => {
    if (gameState.status === 'LOBBY') {
      updateGlobalGameState({ status: 'QUESTION_SHOW', currentQuestionIndex: 0 });
    } else if (gameState.status === 'QUESTION_SHOW') {
      updateGlobalGameState({ status: 'VOTING_OPEN' });
    } else if (gameState.status === 'VOTING_OPEN') {
      updateGlobalGameState({ status: 'VOTING_CLOSED' });
    } else if (gameState.status === 'VOTING_CLOSED') {
      const currentQ = gameState.questions[gameState.currentQuestionIndex];
      const qVotes = gameState.votes[currentQ.id] || {};
      const couplePick = gameState.coupleChoices[currentQ.id] || {};

      const newPlayers = { ...gameState.players };
      Object.entries(qVotes).forEach(([pId, choice]) => {
        if (newPlayers[pId]?.role === 'GUEST') {
          let pts = 0;
          if (couplePick.brideChoice && choice === couplePick.brideChoice) pts += 50;
          if (couplePick.groomChoice && choice === couplePick.groomChoice) pts += 50;
          const currentScore = newPlayers[pId]?.score || 0;
          newPlayers[pId] = {
            ...newPlayers[pId],
            score: currentScore + pts,
          };
        }
      });

      playAudioEffect('reveal');
      updateGlobalGameState({ status: 'REVEAL', players: newPlayers });
    } else if (gameState.status === 'REVEAL') {
      if (gameState.currentQuestionIndex + 1 < gameState.questions.length) {
        updateGlobalGameState({
          status: 'QUESTION_SHOW',
          currentQuestionIndex: gameState.currentQuestionIndex + 1,
        });
      } else {
        updateGlobalGameState({ status: 'GAME_OVER' });
      }
    } else if (gameState.status === 'GAME_OVER') {
      updateGlobalGameState({ status: 'LOBBY', currentQuestionIndex: 0 });
    }
  };

  const setCoupleChoiceByHost = (roleType: PlayerRole, choice: VoteChoice) => {
    const currentQ = gameState.questions[gameState.currentQuestionIndex];
    if (!currentQ) return;

    const currentCoupleChoices = gameState.coupleChoices[currentQ.id] || {};
    const updatedCoupleChoices = {
      ...gameState.coupleChoices,
      [currentQ.id]: {
        ...currentCoupleChoices,
        [roleType === 'BRIDE' ? 'brideChoice' : 'groomChoice']: choice,
      },
    };

    updateGlobalGameState({ coupleChoices: updatedCoupleChoices });
  };

  const currentQ = gameState.questions[gameState.currentQuestionIndex] || DEFAULT_QUESTIONS[0];
  const qVotes = (currentQ && gameState.votes[currentQ.id]) || {};
  const totalVotesCount = Object.keys(qVotes).length;
  const brideVotesCount = Object.values(qVotes).filter((v) => v === 'Bride').length;
  const groomVotesCount = Object.values(qVotes).filter((v) => v === 'Groom').length;

  const currentCouplePick = (currentQ && gameState.coupleChoices[currentQ.id]) || {};
  const playerVote = qVotes[playerId];

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 font-sans flex flex-col selection:bg-rose-500 selection:text-white">
      {/* Navigation & View Selection Banner */}
      <header className="bg-slate-950/80 backdrop-blur border-b border-slate-800 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 sticky top-0 z-40">
        <div className="flex items-center gap-2">
          <div className="bg-gradient-to-tr from-rose-500 to-amber-400 p-1.5 rounded-lg shadow-lg">
            <Heart className="w-5 h-5 text-white fill-rose-500 animate-pulse" />
          </div>
          <div>
            <h1 className="font-bold text-sm tracking-wide text-rose-300">WHO IS MORE LIKELY TO...?</h1>
            <p className="text-[10px] text-slate-400 font-mono">
              ROOM CODE: <span className="text-amber-400 font-bold">{sessionCode}</span>
            </p>
          </div>
        </div>

        {/* View Selection Controls */}
        {/* <div className="flex items-center gap-1.5 bg-slate-900/90 p-1 rounded-xl border border-slate-800 text-xs">
          <button
            onClick={() => setRole('LANDING')}
            className={`px-2.5 py-1 rounded-lg flex items-center gap-1 transition ${
              role === 'LANDING' ? 'bg-rose-600 text-white font-semibold' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Settings className="w-3.5 h-3.5" /> Roles
          </button>
          <button
            onClick={() => setRole('PLAYER')}
            className={`px-2.5 py-1 rounded-lg flex items-center gap-1 transition ${
              role === 'PLAYER' ? 'bg-rose-600 text-white font-semibold' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" /> Player Phone
          </button>
          <button
            onClick={() => setRole('HOST')}
            className={`px-2.5 py-1 rounded-lg flex items-center gap-1 transition ${
              role === 'HOST' ? 'bg-rose-600 text-white font-semibold' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Crown className="w-3.5 h-3.5" /> Host Controller
          </button>
          <button
            onClick={() => setRole('SCREEN')}
            className={`px-2.5 py-1 rounded-lg flex items-center gap-1 transition ${
              role === 'SCREEN' ? 'bg-rose-600 text-white font-semibold' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Tv className="w-3.5 h-3.5" /> Big Screen TV
          </button>
        </div> */}

        {/* Mute SFX Toggle */}
        <button
          onClick={() => setSoundEnabled(!soundEnabled)}
          className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition"
          title={soundEnabled ? 'Mute SFX' : 'Unmute SFX'}
        >
          {soundEnabled ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4 text-slate-500" />}
        </button>
      </header>

      {/* Main View Display Area */}
      <main className="flex-1 flex flex-col items-center justify-center p-3 sm:p-6 max-w-6xl w-full mx-auto">
        
        {/* LANDING / ROLE SELECTOR */}
        {/* {role === 'LANDING' && (
          <div className="w-full max-w-xl bg-slate-950 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl text-center space-y-6 relative overflow-hidden">
            <div className="absolute -top-24 -right-24 w-48 h-48 bg-rose-500/10 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

            <div className="inline-flex p-3 bg-gradient-to-tr from-rose-500/20 to-amber-500/20 rounded-2xl border border-rose-500/30 mb-2">
              <Sparkles className="w-10 h-10 text-rose-400" />
            </div>

            <h2 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-rose-300 via-amber-200 to-rose-400">
              Who Is More Likely To...?
            </h2>
            <p className="text-slate-400 text-sm max-w-md mx-auto">
              Real-time pre-wedding celebration game! Guests, Bride, and Groom vote live from their phones.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-left pt-2">
              <button
                onClick={() => setRole('PLAYER')}
                className="group p-4 bg-slate-900 hover:bg-slate-800/90 border border-slate-800 hover:border-rose-500/50 rounded-2xl transition flex flex-col justify-between"
              >
                <div>
                  <div className="p-2 w-fit bg-rose-500/10 rounded-xl text-rose-400 group-hover:scale-110 transition">
                    <Smartphone className="w-6 h-6" />
                  </div>
                  <h3 className="font-bold text-base mt-3 text-white">Player / Couple</h3>
                  <p className="text-xs text-slate-400 mt-1">Vote on questions live from your phone.</p>
                </div>
                <div className="mt-4 flex items-center text-xs font-semibold text-rose-400 group-hover:translate-x-1 transition">
                  Join as Player <ChevronRight className="w-4 h-4 ml-1" />
                </div>
              </button>

              <button
                onClick={() => setRole('HOST')}
                className="group p-4 bg-slate-900 hover:bg-slate-800/90 border border-slate-800 hover:border-amber-500/50 rounded-2xl transition flex flex-col justify-between"
              >
                <div>
                  <div className="p-2 w-fit bg-amber-500/10 rounded-xl text-amber-400 group-hover:scale-110 transition">
                    <Crown className="w-6 h-6" />
                  </div>
                  <h3 className="font-bold text-base mt-3 text-white">Host Controller</h3>
                  <p className="text-xs text-slate-400 mt-1">Control question stages & trigger reveals.</p>
                </div>
                <div className="mt-4 flex items-center text-xs font-semibold text-amber-400 group-hover:translate-x-1 transition">
                  Open Host <ChevronRight className="w-4 h-4 ml-1" />
                </div>
              </button>

              <button
                onClick={() => setRole('SCREEN')}
                className="group p-4 bg-slate-900 hover:bg-slate-800/90 border border-slate-800 hover:border-purple-500/50 rounded-2xl transition flex flex-col justify-between"
              >
                <div>
                  <div className="p-2 w-fit bg-purple-500/10 rounded-xl text-purple-400 group-hover:scale-110 transition">
                    <Tv className="w-6 h-6" />
                  </div>
                  <h3 className="font-bold text-base mt-3 text-white">Big Screen TV</h3>
                  <p className="text-xs text-slate-400 mt-1">Main display for room with hidden live votes.</p>
                </div>
                <div className="mt-4 flex items-center text-xs font-semibold text-purple-400 group-hover:translate-x-1 transition">
                  Open TV View <ChevronRight className="w-4 h-4 ml-1" />
                </div>
              </button>
            </div>

            <div className="pt-4 border-t border-slate-800 text-xs text-slate-400 flex items-center justify-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span>Synced with Firebase Firestore Real-Time Database</span>
            </div>
          </div>
        )} */}

        {/* PLAYER MOBILE PHONE VIEW */}
        {role === 'PLAYER' && (
          <div className="w-full max-w-md mx-auto space-y-4">
            {!gameState.players[playerId]?.name ? (
              <form onSubmit={handleRegisterPlayer} className="bg-slate-950 border border-slate-800 p-6 rounded-3xl shadow-xl space-y-5 text-center">
                <div className="w-12 h-12 bg-rose-500/20 text-rose-400 rounded-2xl flex items-center justify-center mx-auto">
                  <Smartphone className="w-6 h-6" />
                </div>
                <h2 className="text-xl font-bold text-white">Join the Party Game</h2>
                <p className="text-xs text-slate-400">Select who you are joining as:</p>
                
                <input
                  type="text"
                  placeholder="Your Name / Nickname"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-rose-500 text-center font-medium"
                  required
                />

                <div className="grid grid-cols-3 gap-2 pt-1 text-xs">
                  <button
                    type="button"
                    onClick={() => setPlayerRole('GUEST')}
                    className={`py-2.5 rounded-xl border font-bold transition ${
                      playerRole === 'GUEST'
                        ? 'bg-rose-500/20 border-rose-500 text-rose-300'
                        : 'bg-slate-900 border-slate-800 text-slate-400'
                    }`}
                  >
                    🎉 Guest
                  </button>
                  <button
                    type="button"
                    onClick={() => setPlayerRole('BRIDE')}
                    className={`py-2.5 rounded-xl border font-bold transition ${
                      playerRole === 'BRIDE'
                        ? 'bg-pink-500/20 border-pink-500 text-pink-300'
                        : 'bg-slate-900 border-slate-800 text-slate-400'
                    }`}
                  >
                    👑 Bride
                  </button>
                  <button
                    type="button"
                    onClick={() => setPlayerRole('GROOM')}
                    className={`py-2.5 rounded-xl border font-bold transition ${
                      playerRole === 'GROOM'
                        ? 'bg-blue-500/20 border-blue-500 text-blue-300'
                        : 'bg-slate-900 border-slate-800 text-slate-400'
                    }`}
                  >
                    🎩 Groom
                  </button>
                </div>

                <button
                  type="submit"
                  className="w-full py-3.5 bg-gradient-to-r from-rose-500 to-amber-500 hover:from-rose-600 hover:to-amber-600 text-white font-bold rounded-xl shadow-lg shadow-rose-500/20 transition active:scale-95"
                >
                  Enter Game Room
                </button>
              </form>
            ) : (
              <div className="space-y-4">
                <div className="bg-slate-950 border border-slate-800 p-4 rounded-2xl flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-8 h-8 rounded-full font-bold text-sm flex items-center justify-center border ${
                      playerRole === 'BRIDE' ? 'bg-pink-500/20 text-pink-300 border-pink-500/30' :
                      playerRole === 'GROOM' ? 'bg-blue-500/20 text-blue-300 border-blue-500/30' :
                      'bg-rose-500/20 text-rose-300 border-rose-500/30'
                    }`}>
                      {gameState.players[playerId]?.name?.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="font-bold text-sm text-white flex items-center gap-1.5">
                        {gameState.players[playerId]?.name}
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                          {playerRole}
                        </span>
                      </h3>
                      <p className="text-[10px] text-slate-400 font-mono">ROOM: {sessionCode}</p>
                    </div>
                  </div>
                  {playerRole === 'GUEST' && (
                    <div className="text-right">
                      <p className="text-[10px] text-slate-400 uppercase font-mono">Score</p>
                      <p className="text-lg font-black text-amber-400">{gameState.players[playerId]?.score || 0} pts</p>
                    </div>
                  )}
                </div>

                {gameState.status === 'LOBBY' && (
                  <div className="bg-slate-950 border border-slate-800 p-8 rounded-3xl text-center space-y-4">
                    <div className="w-16 h-16 bg-amber-500/10 text-amber-400 rounded-full flex items-center justify-center mx-auto animate-bounce">
                      <Sparkles className="w-8 h-8" />
                    </div>
                    <h3 className="text-lg font-bold text-white">You're In!</h3>
                    <p className="text-xs text-slate-400">Waiting for host to launch the first question...</p>
                  </div>
                )}

                {gameState.status === 'QUESTION_SHOW' && (
                  <div className="bg-slate-950 border border-slate-800 p-6 rounded-3xl text-center space-y-5">
                    <div className="inline-block px-3 py-1 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 text-xs font-semibold">
                      Question #{gameState.currentQuestionIndex + 1}
                    </div>
                    <h2 className="text-xl font-bold text-white leading-snug">"{currentQ?.text}"</h2>
                    <div className="p-4 bg-slate-900/80 rounded-2xl border border-slate-800 text-xs text-slate-400 animate-pulse">
                      Get ready! Host is opening voting shortly...
                    </div>
                  </div>
                )}

                {gameState.status === 'VOTING_OPEN' && (
                  <div className="bg-slate-950 border border-slate-800 p-5 rounded-3xl text-center space-y-5">
                    <div className="inline-block px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-semibold animate-pulse">
                      ⚡ Voting OPEN! (You can change vote)
                    </div>

                    <h2 className="text-lg font-bold text-white">"{currentQ?.text}"</h2>

                    <div className="grid grid-cols-1 gap-3 pt-1">
                      <button
                        onClick={() => handleCastVote('Bride')}
                        className={`w-full py-5 px-4 rounded-2xl font-black text-lg transition flex items-center justify-center gap-2 border shadow-lg ${
                          playerVote === 'Bride'
                            ? 'bg-rose-600 text-white border-rose-400 ring-4 ring-rose-500/30 scale-[1.02]'
                            : 'bg-slate-900 hover:bg-slate-800 text-slate-200 border-slate-800'
                        }`}
                      >
                        <Crown className="w-6 h-6 text-pink-400" /> {gameState.brideName}
                        {playerVote === 'Bride' && <CheckCircle className="w-5 h-5 text-white ml-auto" />}
                      </button>

                      <button
                        onClick={() => handleCastVote('Groom')}
                        className={`w-full py-5 px-4 rounded-2xl font-black text-lg transition flex items-center justify-center gap-2 border shadow-lg ${
                          playerVote === 'Groom'
                            ? 'bg-blue-600 text-white border-blue-400 ring-4 ring-blue-500/30 scale-[1.02]'
                            : 'bg-slate-900 hover:bg-slate-800 text-slate-200 border-slate-800'
                        }`}
                      >
                        <Award className="w-6 h-6 text-blue-400" /> {gameState.groomName}
                        {playerVote === 'Groom' && <CheckCircle className="w-5 h-5 text-white ml-auto" />}
                      </button>
                    </div>

                    {playerVote && (
                      <p className="text-xs text-emerald-400 font-medium flex items-center justify-center gap-1">
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" /> You picked: <strong>{playerVote}</strong>. Tap other option to change.
                      </p>
                    )}
                  </div>
                )}

                {gameState.status === 'VOTING_CLOSED' && (
                  <div className="bg-slate-950 border border-slate-800 p-6 rounded-3xl text-center space-y-4">
                    <Lock className="w-10 h-10 text-amber-400 mx-auto animate-bounce" />
                    <h3 className="text-lg font-bold text-white">Voting Locked!</h3>
                    <p className="text-xs text-slate-400">
                      Your vote: <strong className="text-white">{playerVote || 'No vote'}</strong>. Look at the big screen for the reveal!
                    </p>
                  </div>
                )}

                {gameState.status === 'REVEAL' && (
                  <div className="bg-slate-950 border border-slate-800 p-6 rounded-3xl text-center space-y-5">
                    <div className="p-4 bg-slate-900 rounded-2xl border border-slate-800 space-y-2">
                      <p className="text-xs text-slate-400 font-mono uppercase">Couple Answers</p>
                      <div className="flex items-center justify-around font-bold text-sm pt-1">
                        <div className="text-pink-300">
                          {gameState.brideName} says: <span className="text-white block text-base font-black">{currentCouplePick.brideChoice || 'Pending'}</span>
                        </div>
                        <div className="text-blue-300">
                          {gameState.groomName} says: <span className="text-white block text-base font-black">{currentCouplePick.groomChoice || 'Pending'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="p-3 bg-slate-900/60 rounded-xl text-xs text-slate-300">
                      You voted: <strong className="text-amber-400">{playerVote || 'None'}</strong>
                    </div>
                  </div>
                )}

                {gameState.status === 'GAME_OVER' && (
                  <div className="bg-slate-950 border border-slate-800 p-6 rounded-3xl text-center space-y-4">
                    <Trophy className="w-12 h-12 text-amber-400 mx-auto" />
                    <h2 className="text-xl font-black text-white">Game Over!</h2>
                    <p className="text-xs text-slate-400">Check the main display for final scores!</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* HOST DASHBOARD CONTROLLER */}
        {role === 'HOST' && (
          <div className="w-full space-y-6">
            <div className="bg-slate-950 border border-slate-800 p-5 rounded-3xl flex flex-wrap items-center justify-between gap-4 shadow-xl">
              <div>
                <div className="flex items-center gap-2">
                  <Crown className="w-5 h-5 text-amber-400" />
                  <h2 className="text-lg font-bold text-white">Host Control Center</h2>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">Control stages, record couple answers, and reveal results live.</p>
              </div>

              <button
                onClick={hostNextStep}
                className="px-6 py-3 bg-gradient-to-r from-amber-500 to-rose-500 hover:from-amber-600 hover:to-rose-600 text-white font-bold rounded-2xl shadow-lg shadow-rose-500/20 transition active:scale-95 flex items-center gap-2 text-sm"
              >
                {gameState.status === 'LOBBY' && <><Play className="w-4 h-4" /> Start Question #1</>}
                {gameState.status === 'QUESTION_SHOW' && <><Unlock className="w-4 h-4" /> Open Voting</>}
                {gameState.status === 'VOTING_OPEN' && <><Lock className="w-4 h-4" /> Lock Votes</>}
                {gameState.status === 'VOTING_CLOSED' && <><Eye className="w-4 h-4" /> Reveal Results on TV</>}
                {gameState.status === 'REVEAL' && <><ChevronRight className="w-4 h-4" /> Next Question</>}
                {gameState.status === 'GAME_OVER' && <><RotateCcw className="w-4 h-4" /> Reset Game</>}
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="space-y-6">
                <div className="bg-slate-950 border border-slate-800 p-5 rounded-3xl space-y-4">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                    <span>Active Stage</span>
                    <span className="px-2 py-0.5 bg-rose-500/20 text-rose-300 rounded font-mono text-[10px]">{gameState.status}</span>
                  </h3>

                  <div className="p-4 bg-slate-900 rounded-2xl border border-slate-800 space-y-2">
                    <p className="text-xs text-slate-500 font-mono">QUESTION {gameState.currentQuestionIndex + 1} OF {gameState.questions.length}</p>
                    <p className="font-bold text-white text-base">"{currentQ?.text}"</p>
                  </div>

                  <div className="p-4 bg-slate-900 rounded-2xl border border-slate-800 space-y-3">
                    <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider">Record Couple Picks</h4>
                    <p className="text-[11px] text-slate-400">Override or set Bride/Groom picks manually if needed:</p>
                    
                    <div className="space-y-1">
                      <p className="text-xs text-pink-300 font-semibold">{gameState.brideName} Picked:</p>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <button
                          onClick={() => setCoupleChoiceByHost('BRIDE', 'Bride')}
                          className={`py-2 rounded-xl border font-bold transition ${
                            currentCouplePick.brideChoice === 'Bride'
                              ? 'bg-pink-500 text-white border-pink-400'
                              : 'bg-slate-800 text-slate-300 border-slate-700'
                          }`}
                        >
                          Bride
                        </button>
                        <button
                          onClick={() => setCoupleChoiceByHost('BRIDE', 'Groom')}
                          className={`py-2 rounded-xl border font-bold transition ${
                            currentCouplePick.brideChoice === 'Groom'
                              ? 'bg-blue-500 text-white border-blue-400'
                              : 'bg-slate-800 text-slate-300 border-slate-700'
                          }`}
                        >
                          Groom
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1 pt-2">
                      <p className="text-xs text-blue-300 font-semibold">{gameState.groomName} Picked:</p>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <button
                          onClick={() => setCoupleChoiceByHost('GROOM', 'Bride')}
                          className={`py-2 rounded-xl border font-bold transition ${
                            currentCouplePick.groomChoice === 'Bride'
                              ? 'bg-pink-500 text-white border-pink-400'
                              : 'bg-slate-800 text-slate-300 border-slate-700'
                          }`}
                        >
                          Bride
                        </button>
                        <button
                          onClick={() => setCoupleChoiceByHost('GROOM', 'Groom')}
                          className={`py-2 rounded-xl border font-bold transition ${
                            currentCouplePick.groomChoice === 'Groom'
                              ? 'bg-blue-500 text-white border-blue-400'
                              : 'bg-slate-800 text-slate-300 border-slate-700'
                          }`}
                        >
                          Groom
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 bg-slate-900 rounded-2xl border border-slate-800 space-y-2 text-xs">
                    <div className="flex items-center justify-between text-slate-400">
                      <span>Host Private Live Tally:</span>
                      <span className="font-bold text-white font-mono">{totalVotesCount} submitted</span>
                    </div>
                    <div className="flex items-center justify-between text-rose-300">
                      <span>{gameState.brideName}:</span>
                      <span className="font-bold font-mono">{brideVotesCount}</span>
                    </div>
                    <div className="flex items-center justify-between text-blue-300">
                      <span>{gameState.groomName}:</span>
                      <span className="font-bold font-mono">{groomVotesCount}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-2 bg-slate-950 border border-slate-800 p-5 rounded-3xl space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Question Bank Manager
                  </h3>
                  <button
                    onClick={() => {
                      const newQ = {
                        id: 'q_' + Date.now(),
                        text: 'Who is more likely to...?',
                      };
                      updateGlobalGameState({ questions: [...gameState.questions, newQ] });
                    }}
                    className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-rose-400 border border-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1 transition"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Question
                  </button>
                </div>

                <div className="space-y-3 max-h-[480px] overflow-y-auto pr-2">
                  {gameState.questions.map((q, idx) => (
                    <div
                      key={q.id}
                      className={`p-4 rounded-2xl border transition ${
                        idx === gameState.currentQuestionIndex
                          ? 'bg-slate-900/90 border-amber-500/50 shadow-md'
                          : 'bg-slate-900/40 border-slate-800'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                          #{idx + 1}
                        </span>
                        <input
                          type="text"
                          value={q.text}
                          onChange={(e) => {
                            const updated = [...gameState.questions];
                            updated[idx].text = e.target.value;
                            updateGlobalGameState({ questions: updated });
                          }}
                          className="flex-1 bg-transparent border-b border-slate-700 focus:border-rose-500 px-1 py-0.5 text-sm font-medium text-white focus:outline-none"
                        />
                        <button
                          onClick={() => {
                            const updated = gameState.questions.filter((_, i) => i !== idx);
                            updateGlobalGameState({ questions: updated });
                          }}
                          className="text-slate-500 hover:text-rose-400 p-1"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* BIG SCREEN / TV AUDIENCE DISPLAY */}
        {role === 'SCREEN' && (
          <div className="w-full space-y-6 relative">
            <CanvasConfetti trigger={gameState.status === 'REVEAL' || gameState.status === 'GAME_OVER'} />

            <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-950/80 border border-slate-800 p-4 rounded-3xl">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-gradient-to-tr from-rose-500 to-amber-400 rounded-2xl shadow-lg">
                  <Heart className="w-8 h-8 text-white fill-white animate-pulse" />
                </div>
                <div>
                  <h2 className="text-2xl font-black tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-rose-300 via-amber-200 to-rose-400">
                    WHO IS MORE LIKELY TO...?
                  </h2>
                  <p className="text-xs text-slate-400">Pre-Wedding Live Party Game</p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className="text-[10px] text-slate-400 font-mono uppercase">Room Code</p>
                  <p className="text-xl font-black text-amber-400 font-mono">{sessionCode}</p>
                </div>
                <div className="p-3 bg-slate-900 border border-slate-800 rounded-2xl flex items-center gap-2">
                  <Users className="w-5 h-5 text-emerald-400" />
                  <span className="text-lg font-bold text-white font-mono">{Object.keys(gameState.players).length} Joined</span>
                </div>
              </div>
            </div>

            {gameState.status === 'LOBBY' && (
              <div className="bg-slate-950/90 border border-slate-800 rounded-3xl p-8 sm:p-12 text-center space-y-8 shadow-2xl relative overflow-hidden">
                <div className="space-y-3">
                  <span className="px-4 py-1.5 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs font-semibold uppercase tracking-widest">
                    Welcome Guests
                  </span>
                  <h1 className="text-4xl sm:text-5xl font-black text-white">Join the Live Vote!</h1>
                  <p className="text-slate-400 text-sm max-w-lg mx-auto">
                    Switch your device tab or phone to <strong>PLAYER VIEW</strong> to vote live!
                  </p>
                </div>

                <div className="pt-4">
                  <h4 className="text-xs font-mono uppercase tracking-wider text-slate-500 mb-4">
                    Joined Players ({Object.keys(gameState.players).length})
                  </h4>
                  <div className="flex flex-wrap items-center justify-center gap-3 max-w-2xl mx-auto">
                    {Object.keys(gameState.players).length === 0 ? (
                      <p className="text-slate-500 text-sm italic">Waiting for guests to join...</p>
                    ) : (
                      Object.values(gameState.players).map((p, idx) => (
                        <div
                          key={idx}
                          className="px-4 py-2 bg-slate-900 border border-slate-800 rounded-2xl text-sm font-bold text-rose-200 flex items-center gap-2 shadow-md"
                        >
                          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                          {p.name} ({p.role})
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}

            {(gameState.status === 'QUESTION_SHOW' || gameState.status === 'VOTING_OPEN' || gameState.status === 'VOTING_CLOSED') && (
              <div className="bg-slate-950/90 border border-slate-800 rounded-3xl p-8 sm:p-12 space-y-8 shadow-2xl text-center">
                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-900 border border-slate-800 text-xs font-bold font-mono text-amber-400">
                  QUESTION {gameState.currentQuestionIndex + 1} OF {gameState.questions.length}
                </div>

                <h1 className="text-3xl sm:text-5xl font-black text-white leading-tight max-w-3xl mx-auto">
                  "{currentQ?.text}"
                </h1>

                <div className="p-8 bg-slate-900/80 border border-slate-800 rounded-3xl max-w-xl mx-auto space-y-4">
                  <div className="w-16 h-16 bg-rose-500/10 text-rose-400 rounded-full flex items-center justify-center mx-auto">
                    <EyeOff className="w-8 h-8 animate-pulse" />
                  </div>

                  <h3 className="text-xl font-bold text-white">Live Votes Hidden!</h3>
                  <p className="text-xs text-slate-400">
                    {gameState.status === 'VOTING_OPEN'
                      ? 'Guests and couple are submitting votes on their phones right now...'
                      : 'Voting is locked! Waiting for Host to reveal couple choices and live votes.'}
                  </p>

                  <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-950 border border-slate-800 text-amber-400 text-xs font-mono font-bold">
                    <Users className="w-4 h-4" /> {totalVotesCount} Votes Submitted
                  </div>
                </div>
              </div>
            )}

            {gameState.status === 'REVEAL' && (
              <div className="bg-slate-950/90 border border-slate-800 rounded-3xl p-8 sm:p-12 space-y-8 shadow-2xl text-center">
                <span className="px-4 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs font-semibold uppercase tracking-widest">
                  Reveal & Responses
                </span>

                <h2 className="text-2xl sm:text-3xl font-bold text-slate-300">"{currentQ?.text}"</h2>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl mx-auto">
                  <div className="p-6 bg-pink-950/40 border border-pink-500/30 rounded-3xl space-y-2">
                    <div className="flex items-center justify-center gap-1.5 text-pink-300 font-bold text-sm">
                      <Crown className="w-4 h-4" /> {gameState.brideName} Says:
                    </div>
                    <div className="text-3xl font-black text-white">
                      {currentCouplePick.brideChoice || 'No Response'}
                    </div>
                  </div>

                  <div className="p-6 bg-blue-950/40 border border-blue-500/30 rounded-3xl space-y-2">
                    <div className="flex items-center justify-center gap-1.5 text-blue-300 font-bold text-sm">
                      <Award className="w-4 h-4" /> {gameState.groomName} Says:
                    </div>
                    <div className="text-3xl font-black text-white">
                      {currentCouplePick.groomChoice || 'No Response'}
                    </div>
                  </div>
                </div>

                <div className="max-w-2xl mx-auto space-y-3 pt-2">
                  <h4 className="text-xs font-bold uppercase text-slate-400 text-left">
                    Guest Vote Breakdown ({totalVotesCount} Total)
                  </h4>

                  <div className="space-y-3">
                    <div>
                      <div className="flex items-center justify-between text-sm mb-1 font-bold">
                        <span className="text-pink-300">{gameState.brideName}</span>
                        <span className="text-slate-300 font-mono">
                          {totalVotesCount > 0 ? Math.round((brideVotesCount / totalVotesCount) * 100) : 0}% ({brideVotesCount} guests)
                        </span>
                      </div>
                      <div className="w-full bg-slate-900 rounded-full h-6 overflow-hidden p-1 border border-slate-800">
                        <div
                          className="bg-gradient-to-r from-pink-500 to-rose-500 h-full rounded-full transition-all duration-700"
                          style={{
                            width: totalVotesCount > 0 ? `${(brideVotesCount / totalVotesCount) * 100}%` : '0%',
                          }}
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between text-sm mb-1 font-bold">
                        <span className="text-blue-300">{gameState.groomName}</span>
                        <span className="text-slate-300 font-mono">
                          {totalVotesCount > 0 ? Math.round((groomVotesCount / totalVotesCount) * 100) : 0}% ({groomVotesCount} guests)
                        </span>
                      </div>
                      <div className="w-full bg-slate-900 rounded-full h-6 overflow-hidden p-1 border border-slate-800">
                        <div
                          className="bg-gradient-to-r from-blue-500 to-indigo-500 h-full rounded-full transition-all duration-700"
                          style={{
                            width: totalVotesCount > 0 ? `${(groomVotesCount / totalVotesCount) * 100}%` : '0%',
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {gameState.status === 'GAME_OVER' && (
              <div className="bg-slate-950/90 border border-slate-800 rounded-3xl p-8 sm:p-12 text-center space-y-8 shadow-2xl">
                <Trophy className="w-16 h-16 text-amber-400 mx-auto animate-bounce" />
                <h1 className="text-4xl font-black text-white">Celebration Scoreboard!</h1>

                <div className="max-w-md mx-auto space-y-3">
                  {Object.values(gameState.players)
                    .filter((p) => p.role === 'GUEST')
                    .sort((a, b) => b.score - a.score)
                    .map((p, idx) => (
                      <div
                        key={idx}
                        className={`flex items-center justify-between p-4 rounded-2xl border ${
                          idx === 0
                            ? 'bg-amber-500/20 border-amber-500 text-amber-200 text-lg font-bold'
                            : 'bg-slate-900 border-slate-800 text-slate-300 text-sm'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="font-mono font-black">#{idx + 1}</span>
                          <span>{p.name}</span>
                        </div>
                        <span className="font-mono font-bold">{p.score} pts</span>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        )}

      </main>

      <footer className="py-3 px-4 border-t border-slate-800 text-center text-[11px] text-slate-500">
        Who Is More Likely To...? • Pre-Wedding Party Game
      </footer>
    </div>
  );
}