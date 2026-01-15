// Pega as dependências globais
const { useState, useEffect, useMemo } = React;
const Motion = window.Motion || { motion: { div: 'div', button: 'button' }, AnimatePresence: ({children}) => children };
const { motion, AnimatePresence } = Motion;

// =====================
// TELA 1: LOGIN / CADASTRO
// =====================
function AuthScreen() {
  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    if (!window.Firebase) { setError("Firebase offline."); setLoading(false); return; }
    const { auth, signInWithEmailAndPassword, createUserWithEmailAndPassword } = window.Firebase;

    try {
      if (isRegistering) {
        await createUserWithEmailAndPassword(auth, email, password);
        // O App detectará o login e, como não tem nome, jogará para a tela de Apelido
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err) {
      console.error(err);
      let msg = "Erro na conexão.";
      if (err.code === "auth/invalid-credential") msg = "E-mail ou senha incorretos.";
      if (err.code === "auth/email-already-in-use") msg = "E-mail já cadastrado.";
      if (err.code === "auth/weak-password") msg = "A senha deve ter pelo menos 6 caracteres.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#1e1e1e]">
      <div className="w-full max-w-sm bg-[#252525] p-6 rounded-lg border border-zinc-700 shadow-xl">
        <h1 className="text-2xl font-bold text-center text-indigo-500 mb-6">{isRegistering ? "Criar Conta" : "Login"}</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs text-zinc-400">E-mail</label>
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)} className="w-full bg-[#1a1a1a] p-2 rounded border border-zinc-700 text-white outline-none focus:border-indigo-500"/>
          </div>
          <div>
            <label className="text-xs text-zinc-400">Senha</label>
            <input type="password" required value={password} onChange={e => setPassword(e.target.value)} className="w-full bg-[#1a1a1a] p-2 rounded border border-zinc-700 text-white outline-none focus:border-indigo-500"/>
          </div>
          {error && <div className="text-red-400 text-xs text-center">{error}</div>}
          <button type="submit" disabled={loading} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2 rounded disabled:opacity-50">
            {loading ? "Carregando..." : (isRegistering ? "Cadastrar" : "Entrar")}
          </button>
        </form>
        <button onClick={() => setIsRegistering(!isRegistering)} className="block w-full text-center mt-4 text-xs text-zinc-400 hover:text-white underline">
          {isRegistering ? "Já tenho conta. Login." : "Não tem conta? Cadastrar."}
        </button>
      </div>
    </div>
  );
}

// =====================
// TELA 2: ESCOLHER APELIDO (NOVO)
// =====================
function NicknameScreen({ user, onSave }) {
    const [nick, setNick] = useState("");
    const [loading, setLoading] = useState(false);

    const handleSave = async (e) => {
        e.preventDefault();
        if(!nick.trim()) return;
        setLoading(true);
        try {
            // Atualiza o perfil no Firebase
            await window.Firebase.updateProfile(user, { displayName: nick });
            // Avisa o app que salvou
            onSave(nick);
        } catch (error) {
            console.error("Erro ao salvar nome:", error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-[#1e1e1e]">
          <div className="w-full max-w-sm bg-[#252525] p-6 rounded-lg border border-zinc-700 shadow-xl text-center">
            <h1 className="text-2xl font-bold text-amber-500 mb-2">Bem-vindo! 👋</h1>
            <p className="text-zinc-400 text-sm mb-6">Como você quer ser chamado no Board?</p>
            
            <form onSubmit={handleSave} className="space-y-4">
              <input 
                autoFocus
                type="text" 
                placeholder="Seu Apelido"
                required 
                value={nick} 
                onChange={e => setNick(e.target.value)} 
                className="w-full bg-[#1a1a1a] p-3 rounded border border-zinc-700 text-white outline-none focus:border-amber-500 text-center text-lg"
              />
              <button type="submit" disabled={loading} className="w-full bg-amber-600 hover:bg-amber-500 text-black font-bold py-2 rounded disabled:opacity-50">
                {loading ? "Salvando..." : "Começar"}
              </button>
            </form>
          </div>
        </div>
    );
}

// =====================
// APP PRINCIPAL
// =====================

const MOCK_USERS_BASE = [{ id: "sys", name: "Sistema" }];

// Helpers
const scoreFromVotes = (votes) => Object.values(votes || {}).reduce((acc, arr) => acc + arr.reduce((a, b) => a + b, 0), 0);
const votedCount = (votes, authorId) => Object.keys(votes || {}).filter((uid) => uid !== authorId).length;
const userHasVoted = (votes, userId) => Boolean(votes?.[userId]?.length);
const userBoostUsed = (votes, userId) => (votes?.[userId] || []).length > 1;

function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [users, setUsers] = useState(MOCK_USERS_BASE);
  const [boards, setBoards] = useState([]); 
  const [activeBoardId, setActiveBoardId] = useState("b1");
  const [editingBoardId, setEditingBoardId] = useState(null);
  const [activeTab, setActiveTab] = useState("pending");
  const [usersPanelOpen, setUsersPanelOpen] = useState(true);
  const [suggestions, setSuggestions] = useState({ b1: [] });
  const [newText, setNewText] = useState("");
  const [newImage, setNewImage] = useState(null);
  const [economy, setEconomy] = useState({ b1: { fragmentos: 0, boosts: 0 } });
  const [confirmBoost, setConfirmBoost] = useState(null);

  // 1. Inicializar Firebase
  useEffect(() => {
    const initAuth = () => {
        if (!window.Firebase) return;
        const { auth, onAuthStateChanged } = window.Firebase;
        
        onAuthStateChanged(auth, (user) => {
            if (user) {
                // Ao carregar, verifica se já tem nome. Se não, o componente NicknameScreen vai cuidar.
                setCurrentUser(user);
                
                // Se já tiver nome, adiciona à lista
                if (user.displayName) {
                    setUsers(prev => {
                        if (prev.find(u => u.id === user.uid)) return prev;
                        return [...prev, { id: user.uid, name: user.displayName }];
                    });
                }

                setBoards(b => {
                    if (b.length === 0) {
                        const defId = "b1";
                        setActiveBoardId(defId);
                        setEconomy(e => ({...e, [defId]: {fragmentos:0, boosts:0}}));
                        setSuggestions(s => ({...s, [defId]: []}));
                        return [{ id: defId, name: "Geral", archived: false, adminId: user.uid }];
                    }
                    return b;
                });
            } else {
                setCurrentUser(null);
            }
            setAuthReady(true);
        });
    };
    if (window.Firebase) initAuth();
    else window.addEventListener('firebase-ready', initAuth);
  }, []);

  const handleLogout = () => window.Firebase && window.Firebase.signOut(window.Firebase.auth);

  // Callback quando o usuário salva o apelido
  const handleNicknameSaved = (newName) => {
      // Força a atualização do estado do usuário localmente
      const updatedUser = { ...currentUser, displayName: newName };
      setCurrentUser(updatedUser);
      setUsers(prev => [...prev, { id: updatedUser.uid, name: newName }]);
  };

  useEffect(() => {
    if (!activeBoardId) return;
    const e = economy[activeBoardId];
    if (!e) return;
    if (e.fragmentos >= 10) {
      setEconomy((prev) => ({
        ...prev,
        [activeBoardId]: { fragmentos: e.fragmentos % 10, boosts: e.boosts + Math.floor(e.fragmentos / 10) }
      }));
    }
  }, [economy, activeBoardId]);

  const currentUserId = currentUser ? currentUser.uid : null;
  const activeBoard = boards.find((b) => b.id === activeBoardId);
  const currentSuggestions = suggestions[activeBoardId] || [];

  const usersByActivity = useMemo(() => {
    const activity = {};
    currentSuggestions.forEach((s) => {
      Object.keys(s.votes || {}).forEach((uid) => { activity[uid] = Math.max(activity[uid] || 0, new Date(s.createdAt).getTime()); });
    });
    return [...users].sort((a, b) => (activity[b.id] || 0) - (activity[a.id] || 0));
  }, [users, currentSuggestions]);

  // ==========================
  // ROTEAMENTO DE TELAS
  // ==========================
  
  // 1. Carregando
  if (!authReady) return <div className="h-screen flex items-center justify-center text-zinc-500 bg-[#1e1e1e]">Conectando...</div>;
  
  // 2. Não Logado -> Auth
  if (!currentUser) return <AuthScreen />;

  // 3. Logado mas sem Apelido -> Nickname
  if (!currentUser.displayName) return <NicknameScreen user={currentUser} onSave={handleNicknameSaved} />;

  // 4. App Principal (Proteção Board)
  if (!activeBoard && boards.length > 0) setActiveBoardId(boards[0].id);

  const isArchivedBoard = activeBoard?.archived;
  const isAdmin = activeBoard?.adminId === currentUserId;

  // Lógica de ações (Mantida igual)
  const createBoard = () => {
    const id = crypto.randomUUID();
    setBoards((b) => [...b, { id, name: "Novo Board", archived: false, adminId: currentUserId }]);
    setSuggestions((s) => ({ ...s, [id]: [] }));
    setEconomy((e) => ({ ...e, [id]: { fragmentos: 0, boosts: 0 } }));
    setActiveBoardId(id);
  };

  const renameBoard = (id, name) => {
    setBoards((b) => b.map((bd) => (bd.id === id ? { ...bd, name } : bd)));
    setEditingBoardId(null);
  };

  const archiveBoard = (id) => {
    const board = boards.find((b) => b.id === id);
    if (!board || board.adminId !== currentUserId) return;
    setBoards((b) => b.map((bd) => (bd.id === id ? { ...bd, archived: true } : bd)));
  };

  const unarchiveBoard = (id) => {
    const board = boards.find((b) => b.id === id);
    if (!board || board.adminId !== currentUserId) return;
    setBoards((b) => b.map((bd) => (bd.id === id ? { ...bd, archived: false } : bd)));
    setActiveBoardId(id);
  };

  const createSuggestion = () => {
    if (isArchivedBoard) return;
    if (!newText.trim() && !newImage) return;
    setSuggestions((prev) => ({
      ...prev,
      [activeBoardId]: [
        ...(prev[activeBoardId] || []),
        { id: crypto.randomUUID(), author: currentUserId, createdAt: new Date().toISOString(), content: { text: newText, image: newImage }, votes: {} }
      ]
    }));
    setNewText(""); setNewImage(null);
  };

  const voteInitial = (id, value) => {
    if (isArchivedBoard) return;
    setSuggestions((prev) => ({
      ...prev,
      [activeBoardId]: prev[activeBoardId].map((s) => {
        if (s.id !== id) return s;
        if (s.author === currentUserId) return s;
        if (userHasVoted(s.votes, currentUserId)) return s;
        setEconomy((e) => ({ ...e, [activeBoardId]: { ...e[activeBoardId], fragmentos: (e[activeBoardId]?.fragmentos || 0) + 1 } }));
        return { ...s, votes: { ...s.votes, [currentUserId]: [value] } };
      })
    }));
  };

  const applyBoost = (id) => {
    if (isArchivedBoard) return;
    const boardEco = economy[activeBoardId];
    if (!boardEco || boardEco.boosts <= 0) return;
    setSuggestions((prev) => ({
      ...prev,
      [activeBoardId]: prev[activeBoardId].map((s) => {
        if (s.id !== id) return s;
        const userVotes = s.votes[currentUserId] || [];
        if (userBoostUsed(s.votes, currentUserId)) return s;
        let appliedValue = 1;
        if (s.author !== currentUserId) {
             const lastVote = userVotes[userVotes.length - 1];
             if (lastVote === 0) {
                 const score = scoreFromVotes(s.votes);
                 appliedValue = score > 0 ? -1 : score < 0 ? 1 : 0;
             } else if (typeof lastVote === "number") appliedValue = lastVote;
        }
        setEconomy((e) => ({ ...e, [activeBoardId]: { fragmentos: e[activeBoardId].fragmentos, boosts: e[activeBoardId].boosts - 1 } }));
        return { ...s, votes: { ...s.votes, [currentUserId]: [...userVotes, appliedValue] }, _boosted: true };
      })
    }));
  };

  const pending = currentSuggestions.filter((s) => !userHasVoted(s.votes, currentUserId) && s.author !== currentUserId);
  const review = currentSuggestions.filter((s) => userHasVoted(s.votes, currentUserId) || s.author === currentUserId);
  const ranked = currentSuggestions.filter((s) => votedCount(s.votes, s.author) >= 1).sort((a, b) => scoreFromVotes(b.votes) - scoreFromVotes(a.votes));

  return (
    <div className="min-h-screen text-zinc-200 p-4 max-w-md mx-auto flex gap-3 bg-[#1e1e1e]">
      {/* SIDEBAR */}
      <div className={`bg-[#1a1a1a] rounded p-2 transition-all ${usersPanelOpen ? "w-28" : "w-8"}`}>
        <button className="text-xs text-zinc-400 mb-2 w-full text-left" onClick={() => setUsersPanelOpen((v) => !v)}>👥</button>
        {usersPanelOpen && (
          <div className="space-y-1">
             <div className="text-[10px] text-zinc-500 mb-1 border-b border-zinc-700 pb-1 break-words">
                {currentUser.displayName || currentUser.email.split('@')[0]}
             </div>
            {usersByActivity.map((u) => (
              <div key={u.id} className="flex items-center gap-1 text-xs truncate"><span>{u.name}</span>{activeBoard?.adminId === u.id && "⭐"}</div>
            ))}
             <button onClick={handleLogout} className="mt-4 text-[10px] text-red-400 border border-red-900 rounded px-1 w-full hover:bg-red-900/20">Sair</button>
          </div>
        )}
      </div>

      {/* AREA PRINCIPAL */}
      <div className="flex-1 min-w-0">
        
        {/* NAV BOARDS */}
        <div className="flex gap-2 mb-3 overflow-x-auto pb-2 scrollbar-thin">
          {boards.length === 0 && <span className="text-xs text-zinc-500 p-1">Sem boards...</span>}
          {boards.filter((b) => !b.archived).map((b) => (
            <button key={b.id} onClick={() => setActiveBoardId(b.id)} className={`px-3 py-1 rounded text-sm whitespace-nowrap ${b.id === activeBoardId ? "bg-indigo-600" : "bg-[#2b2b2b]"}`}>
                {b.name}
            </button>
          ))}
          <button onClick={createBoard} className="px-2 py-1 bg-green-600 rounded whitespace-nowrap font-bold">+</button>
        </div>

        {/* HEADER */}
        {activeBoard ? (
            <header className="mb-4 space-y-1">
                {editingBoardId === activeBoard.id ? (
                    <input autoFocus className="bg-[#252525] p-1 rounded text-sm text-white w-full border border-indigo-500 outline-none" defaultValue={activeBoard.name} onBlur={(e) => renameBoard(activeBoard.id, e.target.value)} onKeyDown={(e) => e.key === "Enter" && renameBoard(activeBoard.id, e.target.value)} />
                ) : (
                    <h1 className="text-lg font-semibold cursor-pointer hover:text-indigo-400" onClick={() => isAdmin && setEditingBoardId(activeBoard.id)}>{activeBoard.name} {isAdmin && "✎"}</h1>
                )}
                <div className="flex justify-between items-center text-xs text-zinc-400">
                    <div>🧩 {economy[activeBoardId]?.fragmentos || 0} · ⚡ {economy[activeBoardId]?.boosts || 0}</div>
                    {isAdmin && !isArchivedBoard && <button onClick={() => archiveBoard(activeBoard.id)} className="hover:text-red-400">Arquivar</button>}
                    {isAdmin && isArchivedBoard && <button onClick={() => unarchiveBoard(activeBoard.id)} className="text-green-400">Desarquivar</button>}
                </div>
            </header>
        ) : (
            <div className="p-4 text-center text-zinc-500 border border-dashed border-zinc-700 rounded mb-4">Crie um board acima.</div>
        )}

        {activeBoard && (
            <>
                <div className="flex gap-2 mb-4">
                  <Tab icon="⏳" active={activeTab === "pending"} onClick={() => setActiveTab("pending")} />
                  <Tab icon="📝" active={activeTab === "review"} onClick={() => setActiveTab("review")} />
                  <Tab icon="📊" active={activeTab === "rank"} onClick={() => setActiveTab("rank")} />
                </div>
                <AnimatePresence mode="wait">
                  {activeTab === "pending" && <Panel key="p" list={pending} onVote={voteInitial} currentUserId={currentUserId} />}
                  {activeTab === "review" && <Panel key="r" list={review} onVote={voteInitial} onBoost={setConfirmBoost} boosts={economy[activeBoardId]?.boosts || 0} mode="review" currentUserId={currentUserId} />}
                  {activeTab === "rank" && <Panel key="ra" list={ranked} onVote={voteInitial} onBoost={setConfirmBoost} boosts={economy[activeBoardId]?.boosts || 0} mode="rank" currentUserId={currentUserId} />}
                </AnimatePresence>
                <div className="mt-4 border-t border-zinc-700 pt-3 space-y-2">
                  <textarea disabled={isArchivedBoard} value={newText} onChange={(e) => setNewText(e.target.value)} placeholder="Sugestão..." className="w-full bg-[#252525] p-2 rounded text-sm text-white h-20 outline-none resize-none" />
                  <div className="flex gap-2">
                      <input disabled={isArchivedBoard} type="file" accept="image/*" className="text-xs text-zinc-400" onChange={(e) => e.target.files && setNewImage(URL.createObjectURL(e.target.files[0]))} />
                      <button disabled={isArchivedBoard} onClick={createSuggestion} className="flex-1 bg-indigo-600 py-1 rounded font-bold text-sm">Enviar</button>
                  </div>
                </div>
            </>
        )}

        <AnimatePresence>
          {confirmBoost && <ConfirmModal onCancel={() => setConfirmBoost(null)} onConfirm={() => { applyBoost(confirmBoost); setConfirmBoost(null); }} />}
        </AnimatePresence>
      </div>
    </div>
  );
}

// UI Components
function Tab({ active, onClick, icon }) { return <button onClick={onClick} className={`flex-1 py-2 rounded text-xl ${active ? "bg-[#2b2b2b] text-white" : "bg-[#1a1a1a] text-zinc-500 hover:bg-[#252525]"}`}>{icon}</button>; }
function Panel({ list, onVote, onBoost, boosts, mode, currentUserId }) { return <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.2 }}>{list.length === 0 && <div className="text-center text-zinc-500 text-sm py-4 border border-zinc-800 rounded">Vazio.</div>}{list.map((s) => <SuggestionCard key={s.id} s={s} onVote={onVote} onBoost={onBoost} boosts={boosts} mode={mode} currentUserId={currentUserId} />)}</motion.div>; }
function SuggestionCard({ s, onVote, onBoost, boosts, mode, currentUserId }) {
  const score = scoreFromVotes(s.votes);
  const isAuthor = s.author === currentUserId;
  const boostUsed = userBoostUsed(s.votes, currentUserId);
  const [pulse, setPulse] = useState(false);
  useEffect(() => { if (s._boosted) { setPulse(true); setTimeout(() => setPulse(false), 400); } }, [s._boosted]);
  return <motion.div animate={pulse ? { boxShadow: "0 0 0 2px rgba(251,191,36,0.9)", scale: 1.02 } : { scale: 1 }} className={`mb-3 p-3 rounded border space-y-2 relative overflow-hidden ${isAuthor ? "bg-[#2a2438] border-indigo-500/50" : "bg-[#252525] border-zinc-700"}`}>{s.content.text && <div className="text-sm whitespace-pre-wrap">{s.content.text}</div>}{s.content.image && <img src={s.content.image} className="rounded max-h-40 w-full object-cover" />}<div className="flex justify-between items-center mt-2 pt-2 border-t border-white/5"><div className="text-xs font-mono font-bold text-zinc-400">Score: {score}</div><div className="flex gap-2 items-center"><button className="hover:bg-zinc-700 p-1 rounded" onClick={() => onVote && onVote(s.id, 1)} disabled={mode !== "initial" && !onVote}>👍</button><button className="hover:bg-zinc-700 p-1 rounded" onClick={() => onVote && onVote(s.id, 0)} disabled={mode !== "initial" && !onVote}>➖</button><button className="hover:bg-zinc-700 p-1 rounded" onClick={() => onVote && onVote(s.id, -1)} disabled={mode !== "initial" && !onVote}>👎</button>{(mode === "review" || mode === "rank") && boosts > 0 && !boostUsed && ( <button onClick={() => onBoost(s.id)} className="ml-2 text-amber-500 font-bold px-2 hover:bg-amber-600/20 rounded">⚡</button> )}</div></div></motion.div>;
}
function ConfirmModal({ onConfirm, onCancel }) { return <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"><div className="bg-[#252525] p-6 rounded border border-zinc-600 max-w-xs w-full"><h3 className="text-lg font-bold text-amber-500 mb-2">Usar Boost?</h3><p className="text-sm text-zinc-300 mb-4">Gasta 1 Boost e aumenta o peso do voto.</p><div className="flex gap-2"><button onClick={onCancel} className="flex-1 bg-zinc-700 py-2 rounded">Cancelar</button><button onClick={onConfirm} className="flex-1 bg-amber-600 py-2 rounded text-black font-bold">Confirmar</button></div></div></div>; }

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);