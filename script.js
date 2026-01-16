// ==========================================
// CONFIGURAÇÃO E DEPENDÊNCIAS
// ==========================================
const { useState, useEffect, useMemo } = React;
const Motion = window.Motion || { motion: { div: 'div', button: 'button' }, AnimatePresence: ({children}) => children };
const { motion, AnimatePresence } = Motion;

// ==========================================
// TELA 1: AUTENTICAÇÃO (LOGIN / REGISTO)
// ==========================================
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

    if (!window.Firebase) { setError("Firebase não conectado."); setLoading(false); return; }
    const { auth, signInWithEmailAndPassword, createUserWithEmailAndPassword } = window.Firebase;

    try {
      if (isRegistering) {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err) {
      console.error(err);
      let msg = "Erro na conexão.";
      if (err.code === "auth/invalid-credential") msg = "E-mail ou senha incorretos.";
      if (err.code === "auth/email-already-in-use") msg = "E-mail já cadastrado.";
      if (err.code === "auth/weak-password") msg = "Senha muito fraca (mínimo 6 dígitos).";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }} 
        animate={{ opacity: 1, scale: 1 }} 
        className="card w-full max-w-sm p-8"
      >
        <h1 className="text-3xl font-bold text-center mb-6 text-gradient">
            {isRegistering ? "Criar Conta" : "Bem-vindo"}
        </h1>
        
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-xs text-zinc-400 mb-1 ml-1">E-mail</label>
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)} className="input-neon"/>
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1 ml-1">Senha</label>
            <input type="password" required value={password} onChange={e => setPassword(e.target.value)} className="input-neon"/>
          </div>
          
          {error && <div className="p-2 bg-red-500/10 border border-red-500/30 rounded text-red-300 text-xs text-center">{error}</div>}
          
          <button type="submit" disabled={loading} className="btn-primary w-full shadow-lg shadow-indigo-500/20">
            {loading ? <span className="animate-pulse">A processar...</span> : (isRegistering ? "Cadastrar" : "Entrar")}
          </button>
        </form>
        
        <button onClick={() => setIsRegistering(!isRegistering)} className="block w-full text-center mt-6 text-xs text-zinc-400 hover:text-white transition-colors">
          {isRegistering ? "Já tem conta? Faça Login." : "Não tem conta? Crie uma agora."}
        </button>
      </motion.div>
    </div>
  );
}

// ==========================================
// TELA 2: ESCOLHER APELIDO (NICKNAME)
// ==========================================
function NicknameScreen({ user, onSave }) {
    const [nick, setNick] = useState("");
    const [loading, setLoading] = useState(false);

    const handleSave = async (e) => {
        e.preventDefault();
        if(!nick.trim()) return;
        setLoading(true);
        try {
            await window.Firebase.updateProfile(user, { displayName: nick });
            onSave(nick);
        } catch (error) {
            console.error("Erro:", error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4">
          <motion.div 
            initial={{ y: 20, opacity: 0 }} 
            animate={{ y: 0, opacity: 1 }}
            className="card w-full max-w-sm p-8 text-center"
          >
            <h1 className="text-2xl font-bold mb-2 text-gradient">Como devemos chamar-te?</h1>
            <p className="text-zinc-400 text-sm mb-8">Escolha um apelido para aparecer no ranking.</p>
            
            <form onSubmit={handleSave} className="space-y-4">
              <input 
                autoFocus
                type="text" 
                placeholder="O teu Apelido"
                required 
                value={nick} 
                onChange={e => setNick(e.target.value)} 
                className="input-neon text-center text-lg"
                maxLength={15}
              />
              <button type="submit" disabled={loading} className="btn-primary w-full">
                {loading ? "A guardar..." : "Começar a Usar"}
              </button>
            </form>
          </motion.div>
        </div>
    );
}

// ==========================================
// APLICAÇÃO PRINCIPAL (DASHBOARD)
// ==========================================

// Funções Auxiliares de Cálculo
const scoreFromVotes = (votes) => Object.values(votes || {}).reduce((acc, arr) => acc + arr.reduce((a, b) => a + b, 0), 0);
const votedCount = (votes, authorId) => Object.keys(votes || {}).filter((uid) => uid !== authorId).length;
const userHasVoted = (votes, userId) => Boolean(votes?.[userId]?.length);
const userBoostUsed = (votes, userId) => (votes?.[userId] || []).length > 1;

function App() {
  // --- Estados Globais ---
  const [currentUser, setCurrentUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  
  // --- Estados de Dados ---
  const [boards, setBoards] = useState([]); 
  const [activeBoardId, setActiveBoardId] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  
  // --- Estados de UI e Formulários ---
  const [activeTab, setActiveTab] = useState("pending");
  const [newText, setNewText] = useState("");
  const [newImage, setNewImage] = useState(null);
  const [usersPanelOpen, setUsersPanelOpen] = useState(false);
  const [editingBoardId, setEditingBoardId] = useState(null);
  
  // --- Estados dos Modais ---
  const [confirmBoost, setConfirmBoost] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null); // Modal de Deletar
  const [isCreatingBoard, setIsCreatingBoard] = useState(false); // Modal de Criar Board
  const [newBoardName, setNewBoardName] = useState("");

  // 1. Inicialização do Auth
  useEffect(() => {
    const initAuth = () => {
        if (!window.Firebase) return;
        const { auth, onAuthStateChanged } = window.Firebase;
        onAuthStateChanged(auth, (user) => {
            setCurrentUser(user ? user : null);
            setAuthReady(true);
        });
    };
    if (window.Firebase) initAuth();
    else window.addEventListener('firebase-ready', initAuth);
  }, []);

  // 2. Carregar Boards (Firestore Realtime)
  useEffect(() => {
    if (!currentUser || !window.Firebase) return;
    const { db, collection, onSnapshot, query, orderBy } = window.Firebase;
    
    const q = query(collection(db, "boards"), orderBy("createdAt", "asc"));
    const unsub = onSnapshot(q, (snapshot) => {
        const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setBoards(list);
        // Se não houver board ativo, seleciona o primeiro
        if (list.length > 0 && !activeBoardId) {
             setActiveBoardId(list[0].id);
        }
    });
    return () => unsub();
  }, [currentUser, activeBoardId]);

  // 3. Carregar Sugestões (Firestore Realtime)
  useEffect(() => {
    if (!activeBoardId || !window.Firebase) return;
    const { db, collection, onSnapshot, query, orderBy } = window.Firebase;

    const q = query(collection(db, "suggestions"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snapshot) => {
        const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        // Filtra localmente pelo board ativo
        setSuggestions(list.filter(s => s.boardId === activeBoardId));
    });
    return () => unsub();
  }, [activeBoardId]);

  const handleLogout = () => window.Firebase && window.Firebase.signOut(window.Firebase.auth);
  const handleNicknameSaved = (newName) => setCurrentUser({...currentUser, displayName: newName});

  // Variáveis Derivadas
  const currentUserId = currentUser ? currentUser.uid : null;
  const activeBoard = boards.find((b) => b.id === activeBoardId);
  const isAdmin = activeBoard?.adminId === currentUserId;
  const isArchivedBoard = activeBoard?.archived;

  // --- AÇÕES DO UTILIZADOR ---

  // Criar Board (Agora via Modal)
  const handleCreateBoard = async (e) => {
    e.preventDefault();
    if (!newBoardName.trim()) return;
    
    const { db, collection, addDoc } = window.Firebase;
    try {
        const docRef = await addDoc(collection(db, "boards"), {
            name: newBoardName,
            adminId: currentUserId,
            archived: false,
            createdAt: new Date().toISOString(),
            boosts: 0, 
            fragmentos: 0
        });
        
        setActiveBoardId(docRef.id);
        setNewBoardName("");
        setIsCreatingBoard(false);
    } catch (error) {
        console.error("Erro ao criar board:", error);
    }
  };

  const renameBoard = async (id, newName) => {
     const { db, doc, updateDoc } = window.Firebase;
     await updateDoc(doc(db, "boards", id), { name: newName });
     setEditingBoardId(null);
  };

  const archiveBoard = async (id, status) => {
     const { db, doc, updateDoc } = window.Firebase;
     await updateDoc(doc(db, "boards", id), { archived: status });
  };

  // Criar Sugestão
  const createSuggestion = async () => {
    if (isArchivedBoard || (!newText.trim() && !newImage)) return;
    const { db, collection, addDoc } = window.Firebase;
    
    await addDoc(collection(db, "suggestions"), {
        boardId: activeBoardId,
        author: currentUserId,
        authorName: currentUser.displayName || "Anônimo",
        content: { text: newText, image: newImage },
        votes: {}, 
        createdAt: new Date().toISOString()
    });
    setNewText(""); setNewImage(null);
  };

  // Votar Normal
  const voteInitial = async (id, value) => {
    if (isArchivedBoard) return;
    const { db, doc, updateDoc } = window.Firebase;
    const s = suggestions.find(item => item.id === id);
    if (!s) return;

    const newVotes = { ...s.votes, [currentUserId]: [value] };
    await updateDoc(doc(db, "suggestions", id), { votes: newVotes });
    
    // Lógica de Economia (Fragmentos)
    if (!userHasVoted(s.votes, currentUserId)) {
        const boardRef = doc(db, "boards", activeBoardId);
        let newFrag = (activeBoard.fragmentos || 0) + 1;
        let newBoost = activeBoard.boosts || 0;
        if (newFrag >= 10) { newFrag = 0; newBoost += 1; }
        await updateDoc(boardRef, { fragmentos: newFrag, boosts: newBoost });
    }
  };

  // Aplicar Boost
  const applyBoost = async (id) => {
    if (isArchivedBoard || (activeBoard.boosts || 0) <= 0) return;
    const { db, doc, updateDoc } = window.Firebase;
    const s = suggestions.find(item => item.id === id);
    if (!s) return;

    const userVotes = s.votes[currentUserId] || [];
    if (userBoostUsed(s.votes, currentUserId)) return;

    let appliedValue = 1;
    if (s.author !== currentUserId) {
        const lastVote = userVotes[userVotes.length - 1];
        if (typeof lastVote === "number") appliedValue = lastVote;
    }

    const newVotes = { ...s.votes, [currentUserId]: [...userVotes, appliedValue] };
    await updateDoc(doc(db, "suggestions", id), { votes: newVotes });
    await updateDoc(doc(db, "boards", activeBoardId), { boosts: (activeBoard.boosts - 1) });
  };

  // Deletar Sugestão (NOVA FUNÇÃO)
  const handleDeleteSuggestion = async (id) => {
    const { db, doc, deleteDoc } = window.Firebase;
    try {
        await deleteDoc(doc(db, "suggestions", id));
        setConfirmDelete(null); // Fecha o modal
    } catch (error) {
        console.error("Erro ao deletar:", error);
        alert("Erro ao deletar. Verifique se o item ainda existe.");
    }
  };

  // --- Filtros de Visualização ---
  const pending = suggestions.filter((s) => !userHasVoted(s.votes, currentUserId) && s.author !== currentUserId);
  const review = suggestions.filter((s) => userHasVoted(s.votes, currentUserId) || s.author === currentUserId);
  const ranked = suggestions.filter((s) => votedCount(s.votes, s.author) >= 1).sort((a, b) => scoreFromVotes(b.votes) - scoreFromVotes(a.votes));

  // --- Renderização Condicional ---
  if (!authReady) return <div className="h-screen flex items-center justify-center text-zinc-500">A conectar...</div>;
  if (!currentUser) return <AuthScreen />;
  if (!currentUser.displayName) return <NicknameScreen user={currentUser} onSave={handleNicknameSaved} />;

  return (
    <div className="min-h-screen p-2 md:p-6 max-w-4xl mx-auto flex flex-col md:flex-row gap-6">
      
      {/* 1. SIDEBAR (MENU DE UTILIZADOR) */}
      <motion.div 
        layout
        className={`card p-4 flex flex-col gap-2 transition-all duration-300 ${usersPanelOpen ? "md:w-64" : "md:w-16"} ${usersPanelOpen ? "h-auto" : "h-fit"}`}
      >
        <button 
            className="text-zinc-400 hover:text-white flex items-center gap-2 mb-2" 
            onClick={() => setUsersPanelOpen(!usersPanelOpen)}
        >
            <span className="text-xl">👥</span>
            {usersPanelOpen && <span className="text-sm font-bold">Menu</span>}
        </button>
        
        {usersPanelOpen && (
          <motion.div initial={{opacity:0}} animate={{opacity:1}} className="flex flex-col gap-2">
             <div className="bg-white/5 p-2 rounded text-sm border border-white/10 mb-2">
                <div className="text-xs text-zinc-500 uppercase">Logado como</div>
                <div className="font-bold text-indigo-400 truncate">{currentUser.displayName}</div>
             </div>
             <button onClick={handleLogout} className="mt-4 text-xs text-red-400 border border-red-900/50 rounded p-2 hover:bg-red-900/20 w-full transition-colors">
                Sair
             </button>
          </motion.div>
        )}
      </motion.div>

      {/* 2. ÁREA PRINCIPAL */}
      <div className="flex-1 min-w-0 flex flex-col gap-4">
        
        {/* Navegação de Boards */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-thin">
          {boards.length === 0 && <span className="text-xs text-zinc-500">Crie o seu primeiro board →</span>}
          
          {boards.filter((b) => !b.archived).map((b) => (
            <button 
                key={b.id} 
                onClick={() => setActiveBoardId(b.id)} 
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${b.id === activeBoardId ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/30" : "bg-white/5 text-zinc-400 hover:bg-white/10"}`}
            >
                {b.name}
            </button>
          ))}
          
          {/* Botão (+) Abre o Modal */}
          <button 
            onClick={() => setIsCreatingBoard(true)} 
            className="w-8 h-8 rounded-full bg-emerald-600/20 text-emerald-400 border border-emerald-600/50 hover:bg-emerald-600 hover:text-white transition-all flex items-center justify-center font-bold flex-shrink-0"
            title="Criar novo Board"
          >
            +
          </button>
        </div>

        {/* Conteúdo do Board Ativo */}
        {activeBoard ? (
            <motion.div 
                key={activeBoardId}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="card p-4 md:p-6"
            >
                {/* Header do Board */}
                <header className="flex flex-wrap justify-between items-start gap-4 mb-6 border-b border-white/5 pb-4">
                    <div className="flex-1">
                        {editingBoardId === activeBoard.id ? (
                            <input autoFocus className="input-neon text-xl font-bold" defaultValue={activeBoard.name} onBlur={(e) => renameBoard(activeBoard.id, e.target.value)} onKeyDown={(e) => e.key === "Enter" && renameBoard(activeBoard.id, e.target.value)} />
                        ) : (
                            <h1 className="text-2xl font-bold cursor-pointer hover:text-indigo-400 flex items-center gap-2" onClick={() => isAdmin && setEditingBoardId(activeBoard.id)}>
                                {activeBoard.name} 
                                {isAdmin && <span className="text-xs opacity-50">✎</span>}
                            </h1>
                        )}
                    </div>
                    
                    <div className="flex items-center gap-4 bg-black/20 p-2 rounded-lg border border-white/5">
                        <div className="text-center px-2">
                            <div className="text-xs text-zinc-500 uppercase font-bold">Fragmentos</div>
                            <div className="text-lg font-mono text-emerald-400">{activeBoard.fragmentos || 0}</div>
                        </div>
                        <div className="w-px h-8 bg-white/10"></div>
                        <div className="text-center px-2">
                            <div className="text-xs text-zinc-500 uppercase font-bold">Boosts</div>
                            <div className="text-lg font-mono text-amber-400">⚡ {activeBoard.boosts || 0}</div>
                        </div>
                    </div>
                </header>
                
                {/* Abas */}
                <div className="flex gap-2 mb-6 bg-black/20 p-1 rounded-lg">
                  <Tab label="Votar" icon="⏳" active={activeTab === "pending"} onClick={() => setActiveTab("pending")} />
                  <Tab label="Meus" icon="📝" active={activeTab === "review"} onClick={() => setActiveTab("review")} />
                  <Tab label="Top" icon="🏆" active={activeTab === "rank"} onClick={() => setActiveTab("rank")} />
                </div>

                {/* Lista de Sugestões (Painel) */}
                <div className="min-h-[200px]">
                    <AnimatePresence mode="wait">
                    {/* Note a propriedade onDelete sendo passada para os Painéis */}
                    {activeTab === "pending" && <Panel key="p" list={pending} onVote={voteInitial} onDelete={setConfirmDelete} currentUserId={currentUserId} />}
                    {activeTab === "review" && <Panel key="r" list={review} onVote={voteInitial} onBoost={setConfirmBoost} onDelete={setConfirmDelete} boosts={activeBoard.boosts || 0} mode="review" currentUserId={currentUserId} />}
                    {activeTab === "rank" && <Panel key="ra" list={ranked} onVote={voteInitial} onBoost={setConfirmBoost} onDelete={setConfirmDelete} boosts={activeBoard.boosts || 0} mode="rank" currentUserId={currentUserId} />}
                    </AnimatePresence>
                </div>
                
                {/* Área de Criação de Sugestão */}
                <div className="mt-6 pt-4 border-t border-white/10">
                  <div className="relative">
                    <textarea 
                        disabled={isArchivedBoard} 
                        value={newText} 
                        onChange={(e) => setNewText(e.target.value)} 
                        placeholder="Escreva a sua sugestão aqui..." 
                        className="w-full bg-black/20 border border-white/10 rounded-lg p-3 text-sm text-white h-24 outline-none focus:border-indigo-500 focus:bg-black/40 transition-all resize-none mb-3" 
                    />
                    <div className="flex justify-between items-center gap-4">
                        <span className="text-xs text-zinc-500 italic">Imagens (Em breve)</span>
                        <button disabled={isArchivedBoard} onClick={createSuggestion} className="btn-primary px-6 py-2">Enviar Sugestão</button>
                    </div>
                  </div>
                </div>

                {/* Footer de Admin */}
                {isAdmin && (
                    <div className="mt-4 flex justify-end">
                        {!isArchivedBoard && <button onClick={() => archiveBoard(activeBoard.id, true)} className="text-xs text-red-400 hover:underline opacity-50 hover:opacity-100">Arquivar Board</button>}
                        {isArchivedBoard && <button onClick={() => archiveBoard(activeBoard.id, false)} className="text-xs text-emerald-400 hover:underline">Reativar Board</button>}
                    </div>
                )}
            </motion.div>
        ) : (
            <div className="card p-8 text-center border-dashed border-2 border-zinc-700">
                <p className="text-zinc-500">Crie um novo board para começar.</p>
                <button onClick={() => setIsCreatingBoard(true)} className="mt-4 btn-primary">Criar Board Agora</button>
            </div>
        )}

        {/* 3. MODAIS E POP-UPS */}
        <AnimatePresence>
          {/* Modal de Boost */}
          {confirmBoost && <ConfirmModal title="Usar Boost?" desc="Isto gasta 1 Boost e aumenta o peso do voto." icon="⚡" color="amber" onCancel={() => setConfirmBoost(null)} onConfirm={() => { applyBoost(confirmBoost); setConfirmBoost(null); }} />}
          
          {/* Modal de Deletar (Lixeira) */}
          {confirmDelete && <ConfirmModal title="Apagar Sugestão?" desc="Esta ação é permanente. Tem a certeza?" icon="🗑️" color="red" onCancel={() => setConfirmDelete(null)} onConfirm={() => handleDeleteSuggestion(confirmDelete)} />}

          {/* Modal de Criar Board */}
          {isCreatingBoard && (
            <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                <motion.div 
                    initial={{ scale: 0.9, opacity: 0, y: 20 }} 
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.9, opacity: 0, y: 20 }}
                    className="card max-w-sm w-full p-6 shadow-2xl border-indigo-500/30"
                >
                    <h2 className="text-xl font-bold mb-4 text-gradient">Novo Board</h2>
                    <form onSubmit={handleCreateBoard}>
                        <label className="block text-xs text-zinc-400 mb-2">Dê um nome ao seu grupo de sugestões:</label>
                        <input 
                            autoFocus
                            type="text" 
                            className="input-neon mb-6" 
                            placeholder="Ex: Melhorias 2024"
                            value={newBoardName}
                            onChange={(e) => setNewBoardName(e.target.value)}
                            maxLength={30}
                        />
                        <div className="flex gap-3 justify-end">
                            <button type="button" onClick={() => setIsCreatingBoard(false)} className="btn-ghost">Cancelar</button>
                            <button type="submit" className="btn-primary">Criar Board</button>
                        </div>
                    </form>
                </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ==========================================
// COMPONENTES UI REUTILIZÁVEIS
// ==========================================

function Tab({ active, onClick, icon, label }) { 
    return (
        <button 
            onClick={onClick} 
            className={`flex-1 py-2 rounded-md text-sm font-medium transition-all flex items-center justify-center gap-2 ${active ? "bg-indigo-600 text-white shadow-lg" : "text-zinc-400 hover:bg-white/5 hover:text-white"}`}
        >
            <span>{icon}</span>
            <span className="hidden sm:inline">{label}</span>
        </button>
    ); 
}

function Panel({ list, onVote, onBoost, onDelete, boosts, mode, currentUserId }) { 
    return (
        <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.2 }} className="space-y-4">
            {list.length === 0 && (
                <div className="text-center text-zinc-500 py-8 bg-black/10 rounded-lg border border-dashed border-zinc-700">
                    Nenhuma sugestão aqui por enquanto.
                </div>
            )}
            {list.map((s) => <SuggestionCard key={s.id} s={s} onVote={onVote} onBoost={onBoost} onDelete={onDelete} boosts={boosts} mode={mode} currentUserId={currentUserId} />)}
        </motion.div>
    ); 
}

function SuggestionCard({ s, onVote, onBoost, onDelete, boosts, mode, currentUserId }) {
  const score = scoreFromVotes(s.votes);
  const isAuthor = s.author === currentUserId; // Verifica se é o dono
  const boostUsed = userBoostUsed(s.votes, currentUserId);
  const [pulse, setPulse] = useState(false);
  
  useEffect(() => { if (s._boosted) { setPulse(true); setTimeout(() => setPulse(false), 500); } }, [s._boosted]);

  return (
    <motion.div 
        animate={pulse ? { scale: 1.02, boxShadow: "0 0 20px rgba(251, 191, 36, 0.5)" } : { scale: 1 }}
        className={`relative p-4 rounded-xl border transition-all ${isAuthor ? "bg-indigo-900/10 border-indigo-500/30" : "bg-black/20 border-white/5 hover:border-white/10"}`}
    >
        {/* BOTÃO DE LIXEIRA (Só aparece se for o autor) */}
        {isAuthor && onDelete && (
            <button 
                onClick={() => onDelete(s.id)}
                className="absolute top-3 right-3 text-zinc-500 hover:text-red-500 transition-colors p-1 z-10"
                title="Apagar minha sugestão"
            >
                🗑️
            </button>
        )}

        <div className="flex justify-between items-start mb-2 pr-8">
            <span className="text-xs font-bold text-zinc-500">{s.authorName}</span>
            <span className="text-[10px] text-zinc-600">{new Date(s.createdAt).toLocaleDateString()}</span>
        </div>

        {/* Conteúdo */}
        <div className="flex flex-col gap-3">
            {s.content.text && <div className="text-sm md:text-base text-zinc-200 whitespace-pre-wrap break-words">{s.content.text}</div>}
        </div>

        {/* Rodapé do Card */}
        <div className="flex justify-between items-center mt-4 pt-3 border-t border-white/5">
            <div className={`text-xs font-mono font-bold px-2 py-1 rounded ${score > 0 ? 'bg-emerald-500/10 text-emerald-400' : score < 0 ? 'bg-red-500/10 text-red-400' : 'bg-zinc-800 text-zinc-400'}`}>
                Score: {score}
            </div>
            
            <div className="flex gap-2 items-center">
                {mode === "initial" || onVote ? (
                    <>
                    <VoteBtn label="👍" onClick={() => onVote(s.id, 1)} disabled={mode !== "initial"} active={false} />
                    <VoteBtn label="➖" onClick={() => onVote(s.id, 0)} disabled={mode !== "initial"} active={false} />
                    <VoteBtn label="👎" onClick={() => onVote(s.id, -1)} disabled={mode !== "initial"} active={false} />
                    </>
                ) : null}
                
                {(mode === "review" || mode === "rank") && boosts > 0 && !boostUsed && ( 
                    <button onClick={() => onBoost(s.id)} className="ml-2 bg-amber-500/10 text-amber-500 border border-amber-500/30 font-bold p-2 rounded hover:bg-amber-500 hover:text-black transition-all" title="Dar Boost">
                        ⚡ Boost
                    </button> 
                )}
                 {(mode === "review" || mode === "rank") && boostUsed && (
                    <span className="ml-2 text-xs text-amber-500/50 italic">Boost aplicado</span>
                 )}
            </div>
        </div>
    </motion.div>
  );
}

function VoteBtn({ label, onClick, disabled }) {
    return (
        <button 
            className="w-8 h-8 flex items-center justify-center rounded bg-white/5 hover:bg-white/10 border border-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            onClick={onClick}
            disabled={disabled}
        >
            {label}
        </button>
    )
}

// Modal Genérico (Boost e Delete)
function ConfirmModal({ title, desc, icon, color, onConfirm, onCancel }) { 
    // Cores dinâmicas para reutilizar o modal
    const colors = {
        amber: { text: "text-amber-500", border: "border-amber-500/30", bgBtn: "bg-amber-500 hover:bg-amber-400" },
        red:   { text: "text-red-500",   border: "border-red-500/30",   bgBtn: "bg-red-500 hover:bg-red-400" }
    };
    const c = colors[color] || colors.amber;

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div initial={{scale: 0.9, opacity: 0}} animate={{scale: 1, opacity: 1}} className={`card max-w-xs w-full p-6 text-center shadow-2xl ${c.border}`}>
                <div className="text-4xl mb-2">{icon}</div>
                <h3 className={`text-xl font-bold mb-2 ${c.text}`}>{title}</h3>
                <p className="text-sm text-zinc-300 mb-6">{desc}</p>
                <div className="flex gap-3">
                    <button onClick={onCancel} className="btn-ghost flex-1">Cancelar</button>
                    <button onClick={onConfirm} className={`flex-1 ${c.bgBtn} text-black font-bold py-2 rounded transition-colors`}>Confirmar</button>
                </div>
            </motion.div>
        </div>
    ); 
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);