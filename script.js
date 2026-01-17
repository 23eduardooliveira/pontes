// ==========================================
// CONFIGURAÇÃO E DEPENDÊNCIAS
// ==========================================
const { useState, useEffect, useMemo } = React;
const Motion = window.Motion || { motion: { div: 'div', button: 'button' }, AnimatePresence: ({children}) => children };
const { motion, AnimatePresence } = Motion;

// ==========================================
// TELA 1: AUTENTICAÇÃO
// ==========================================
function AuthScreen() {
  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault(); setError(""); setLoading(true);
    if (!window.Firebase) { setError("Firebase não carregou."); setLoading(false); return; }
    const { auth, signInWithEmailAndPassword, createUserWithEmailAndPassword } = window.Firebase;

    try {
      if (isRegistering) await createUserWithEmailAndPassword(auth, email, password);
      else await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      console.error(err);
      let msg = "Erro ao conectar.";
      if (err.code === "auth/invalid-credential") msg = "E-mail ou senha errados.";
      if (err.code === "auth/email-already-in-use") msg = "E-mail já está em uso.";
      if (err.code === "auth/weak-password") msg = "Senha fraca (min 6 caracteres).";
      setError(msg);
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="card w-full max-w-sm p-8">
        <h1 className="text-3xl font-bold text-center mb-6 text-gradient">{isRegistering ? "Criar Conta" : "Login"}</h1>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div><label className="text-xs text-zinc-400 ml-1">E-mail</label><input type="email" required value={email} onChange={e => setEmail(e.target.value)} className="input-neon"/></div>
          <div><label className="text-xs text-zinc-400 ml-1">Senha</label><input type="password" required value={password} onChange={e => setPassword(e.target.value)} className="input-neon"/></div>
          {error && <div className="p-2 bg-red-500/10 border border-red-500/30 rounded text-red-300 text-xs text-center">{error}</div>}
          <button type="submit" disabled={loading} className="btn-primary w-full">{loading ? "Processando..." : (isRegistering ? "Cadastrar" : "Entrar")}</button>
        </form>
        <button onClick={() => setIsRegistering(!isRegistering)} className="block w-full text-center mt-6 text-xs text-zinc-400 hover:text-white transition-colors">{isRegistering ? "Já tem conta? Login." : "Criar conta nova."}</button>
      </motion.div>
    </div>
  );
}

// ==========================================
// TELA 2: APELIDO
// ==========================================
function NicknameScreen({ user, onSave }) {
    const [nick, setNick] = useState("");
    const [loading, setLoading] = useState(false);
    const handleSave = async (e) => {
        e.preventDefault(); if(!nick.trim()) return; setLoading(true);
        try { await window.Firebase.updateProfile(user, { displayName: nick }); onSave(nick); } catch (e) { console.error(e); } finally { setLoading(false); }
    };
    return (
        <div className="min-h-screen flex items-center justify-center p-4">
          <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="card w-full max-w-sm p-8 text-center">
            <h1 className="text-2xl font-bold mb-2 text-gradient">Seu Apelido</h1>
            <p className="text-zinc-400 text-sm mb-8">Como você aparecerá nos grupos.</p>
            <form onSubmit={handleSave} className="space-y-4">
              <input autoFocus type="text" placeholder="Ex: MestreDosCodigos" required value={nick} onChange={e => setNick(e.target.value)} className="input-neon text-center text-lg" maxLength={15}/>
              <button type="submit" disabled={loading} className="btn-primary w-full">{loading ? "Salvando..." : "Entrar"}</button>
            </form>
          </motion.div>
        </div>
    );
}

// ==========================================
// APP PRINCIPAL
// ==========================================

// Helpers
const scoreFromVotes = (votes) => Object.values(votes || {}).reduce((acc, arr) => acc + arr.reduce((a, b) => a + b, 0), 0);
const votedCount = (votes, authorId) => Object.keys(votes || {}).filter((uid) => uid !== authorId).length;
const isUserOnline = (timestamp) => timestamp && (Date.now() - timestamp) < 2 * 60 * 1000;

function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [userData, setUserData] = useState({ fragmentos: 0, boosts: 0 }); 
  const [authReady, setAuthReady] = useState(false);
  
  // Dados
  const [myGroups, setMyGroups] = useState([]); 
  const [activeGroupId, setActiveGroupId] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [groupMembers, setGroupMembers] = useState([]); 
  
  // UI
  const [activeTab, setActiveTab] = useState("pending");
  const [newText, setNewText] = useState("");
  const [toast, setToast] = useState(null);
  
  // Modais
  const [modalMode, setModalMode] = useState(null); 
  const [modalData, setModalData] = useState({});
  const [avatarUrlInput, setAvatarUrlInput] = useState(""); // Controle do input de URL

  // --- 0. Checar Convite na URL ---
  useEffect(() => {
      const params = new URLSearchParams(window.location.search);
      const inviteId = params.get("invite");
      if (inviteId) {
          localStorage.setItem("pendingInvite", inviteId);
          window.history.replaceState({}, document.title, window.location.pathname);
      }
  }, []);

  // --- 1. Inicialização ---
  useEffect(() => {
    const initAuth = () => {
        if (!window.Firebase) return;
        window.Firebase.onAuthStateChanged(window.Firebase.auth, async (user) => {
            setCurrentUser(user || null);
            setAuthReady(true);
            
            if (user) {
                const { db, doc, onSnapshot, updateDoc, arrayUnion } = window.Firebase;
                const unsubUser = onSnapshot(doc(db, "users", user.uid), (docSnap) => {
                    if (docSnap.exists()) {
                        setUserData(prev => ({ ...prev, ...docSnap.data() }));
                    }
                });

                if (localStorage.getItem("pendingInvite")) {
                    const inviteId = localStorage.getItem("pendingInvite");
                    localStorage.removeItem("pendingInvite");
                    try {
                        const groupRef = doc(db, "groups", inviteId);
                        await updateDoc(groupRef, { members: arrayUnion(user.uid) });
                        showToast("Entrou no grupo via convite!", "success");
                        setActiveGroupId(inviteId);
                    } catch(e) { showToast("Erro ao aceitar convite.", "error"); }
                }
                return () => unsubUser();
            }
        });
    };
    if (window.Firebase) initAuth(); else window.addEventListener('firebase-ready', initAuth);
  }, []);

  // --- Presence ---
  useEffect(() => {
    if (!currentUser || !window.Firebase) return;
    const { db, doc, updateDoc, setDoc } = window.Firebase;
    const heartbeat = async () => {
        const userRef = doc(db, "users", currentUser.uid);
        const data = { displayName: currentUser.displayName, email: currentUser.email, lastSeen: Date.now(), photoURL: currentUser.photoURL || null };
        await setDoc(userRef, data, { merge: true }).catch(() => updateDoc(userRef, data));
    };
    heartbeat();
    const interval = setInterval(heartbeat, 60000);
    return () => clearInterval(interval);
  }, [currentUser]);

  // --- Carregar Grupos ---
  useEffect(() => {
    if (!currentUser || !window.Firebase) return;
    const { db, collection, onSnapshot, query, where } = window.Firebase;
    const q = query(collection(db, "groups"), where("members", "array-contains", currentUser.uid));
    const unsub = onSnapshot(q, (snapshot) => {
        const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        list.sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
        setMyGroups(list);
        if (list.length > 0 && !activeGroupId) setActiveGroupId(list[0].id);
    });
    return () => unsub();
  }, [currentUser]);

  // --- Carregar Dados do Grupo ---
  useEffect(() => {
    if (!activeGroupId || !window.Firebase) {
        setSuggestions([]); setGroupMembers([]); return;
    }
    const { db, collection, onSnapshot, query, orderBy, where } = window.Firebase;

    const qSug = query(collection(db, "suggestions"), where("groupId", "==", activeGroupId), orderBy("createdAt", "desc"));
    const unsubSug = onSnapshot(qSug, (snapshot) => {
        setSuggestions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const activeGroup = myGroups.find(g => g.id === activeGroupId);
    const memberIds = activeGroup ? activeGroup.members : [];
    const qUsers = query(collection(db, "users")); 
    const unsubUsers = onSnapshot(qUsers, (snapshot) => {
        const all = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const membersDetails = all.filter(u => memberIds.includes(u.id));
        membersDetails.sort((a, b) => {
            const aOn = isUserOnline(a.lastSeen);
            const bOn = isUserOnline(b.lastSeen);
            if (aOn === bOn) return a.displayName.localeCompare(b.displayName);
            return bOn - aOn;
        });
        setGroupMembers(membersDetails);
    });
    return () => { unsubSug(); unsubUsers(); };
  }, [activeGroupId, myGroups]);

  // --- Toast ---
  const showToast = (msg, type = "success") => {
      setToast({ msg, type });
      setTimeout(() => setToast(null), 3000);
  };

  // --- Variáveis ---
  const activeGroup = myGroups.find(g => g.id === activeGroupId);
  const currentUserId = currentUser ? currentUser.uid : null;
  const isGroupAdmin = activeGroup?.admins?.includes(currentUserId);

  // --- AÇÕES ---
  const createGroup = async (name) => {
    if (!name.trim()) return;
    const { db, collection, addDoc } = window.Firebase;
    const docRef = await addDoc(collection(db, "groups"), { name, createdBy: currentUserId, admins: [currentUserId], members: [currentUserId], createdAt: new Date().toISOString() });
    setActiveGroupId(docRef.id); setModalMode(null); showToast("Grupo criado!");
  };

  const joinGroup = async (groupIdInput) => {
    if (!groupIdInput.trim()) return;
    const { db, doc, updateDoc, getDoc, arrayUnion } = window.Firebase;
    try {
        const groupRef = doc(db, "groups", groupIdInput.trim());
        const groupSnap = await getDoc(groupRef);
        if (!groupSnap.exists()) { showToast("Grupo não encontrado.", "error"); return; }
        await updateDoc(groupRef, { members: arrayUnion(currentUserId) });
        setActiveGroupId(groupIdInput.trim()); setModalMode(null); showToast("Entrou no grupo!");
    } catch (e) { showToast("Erro ao entrar.", "error"); }
  };

  const createSuggestion = async () => {
    if (!newText.trim()) return;
    const { db, collection, addDoc } = window.Firebase;
    await addDoc(collection(db, "suggestions"), { groupId: activeGroupId, author: currentUserId, authorName: currentUser.displayName, content: { text: newText }, votes: {}, reports: [], createdAt: new Date().toISOString() });
    setNewText(""); showToast("Sugestão enviada!");
  };

  const vote = async (id, value) => {
      const s = suggestions.find(i => i.id === id);
      if (!s || s.author === currentUserId) return;
      
      const { db, doc, updateDoc } = window.Firebase;
      const newVotes = { ...s.votes, [currentUserId]: [value] };
      await updateDoc(doc(db, "suggestions", id), { votes: newVotes });
      
      // Economia Pessoal
      if (!Boolean(s.votes?.[currentUserId]?.length)) {
          const userRef = doc(db, "users", currentUserId);
          let frag = (userData.fragmentos || 0) + 1;
          let boost = userData.boosts || 0;
          let msg = null;
          if (frag >= 10) { frag = 0; boost += 1; msg = "Ganhou +1 Boost!"; }
          await updateDoc(userRef, { fragmentos: frag, boosts: boost });
          if(msg) showToast(msg, "success");
      }
  };

  const applyBoost = async (id) => {
    if ((userData.boosts || 0) <= 0) { showToast("Sem Boosts.", "error"); return; }
    const { db, doc, updateDoc } = window.Firebase;
    const s = suggestions.find(item => item.id === id);
    if (!s) return;
    
    const userVotes = s.votes[currentUserId] || [];
    if (userVotes.length > 1) { showToast("Já impulsionou.", "error"); return; }

    let appliedValue = 1;
    if (s.author !== currentUserId && userVotes.length > 0) {
        const lastVote = userVotes[userVotes.length - 1];
        if (typeof lastVote === "number") appliedValue = lastVote;
    }

    const newVotes = { ...s.votes, [currentUserId]: [...userVotes, appliedValue] };
    await updateDoc(doc(db, "suggestions", id), { votes: newVotes, _boosted: true });
    
    await updateDoc(doc(db, "users", currentUserId), { boosts: (userData.boosts - 1) });
    showToast("Boost aplicado! ⚡");
  };

  const reportSuggestion = async (id, reason) => {
      const { db, doc, updateDoc, arrayUnion } = window.Firebase;
      await updateDoc(doc(db, "suggestions", id), { reports: arrayUnion({ reportedBy: currentUserId, reason: reason, timestamp: new Date().toISOString() }) });
      setModalMode(null); showToast("Denúncia enviada.");
  };

  const dismissReports = async (id) => {
      const { db, doc, updateDoc } = window.Firebase;
      await updateDoc(doc(db, "suggestions", id), { reports: [] });
      showToast("Denúncias ignoradas.");
  };

  const openProfile = (user) => {
      const userSug = suggestions.filter(s => s.author === user.id);
      const totalScore = userSug.reduce((acc, s) => acc + scoreFromVotes(s.votes), 0);
      setModalData({ user: user, stats: { count: userSug.length, score: totalScore }, history: userSug });
      setAvatarUrlInput(""); // Reseta o input de foto
      setModalMode("profile");
  };

  // --- ATUALIZAÇÃO DE FOTO (LINK APENAS) ---
  const handleUpdateAvatar = async (url) => {
      if(!url.trim()) return;
      try {
          await window.Firebase.updateProfile(currentUser, { photoURL: url });
          const { db, doc, updateDoc } = window.Firebase;
          await updateDoc(doc(db, "users", currentUser.uid), { photoURL: url });
          
          if(modalData.user && modalData.user.id === currentUser.uid) {
               setModalData(prev => ({...prev, user: {...prev.user, photoURL: url}}));
          }
          setCurrentUser({...currentUser, photoURL: url});
          showToast("Foto atualizada!");
      } catch(e) { showToast("Erro ao atualizar foto.", "error"); }
  };

  const copyInviteLink = () => {
      const url = `${window.location.origin}${window.location.pathname}?invite=${activeGroupId}`;
      navigator.clipboard.writeText(url);
      showToast("Link copiado!");
  }

  const manageMember = async (action, targetId) => {
      const { db, doc, updateDoc, arrayUnion, arrayRemove } = window.Firebase;
      const groupRef = doc(db, "groups", activeGroupId);
      if (action === "promote") await updateDoc(groupRef, { admins: arrayUnion(targetId) });
      else if (action === "kick") await updateDoc(groupRef, { members: arrayRemove(targetId), admins: arrayRemove(targetId) });
      setModalMode(null);
      showToast(action === "promote" ? "Promovido." : "Removido.");
  };

  const deleteSuggestion = async (id) => {
      const { db, doc, deleteDoc } = window.Firebase;
      await deleteDoc(doc(db, "suggestions", id));
      setModalMode(null); showToast("Apagada.");
  };

  const handleLeaveGroup = async () => {
      const { db, doc, updateDoc, arrayRemove } = window.Firebase;
      const groupRef = doc(db, "groups", activeGroupId);
      await updateDoc(groupRef, { members: arrayRemove(currentUserId), admins: arrayRemove(currentUserId) });
      setActiveGroupId(null); setModalMode(null); showToast("Saiu do grupo.");
  };

  const pending = suggestions.filter((s) => !Boolean(s.votes?.[currentUserId]?.length) && s.author !== currentUserId);
  const review = suggestions.filter((s) => Boolean(s.votes?.[currentUserId]?.length) || s.author === currentUserId);
  const ranked = suggestions.filter((s) => Object.keys(s.votes || {}).filter(uid => uid !== s.author).length >= 1).sort((a, b) => scoreFromVotes(b.votes) - scoreFromVotes(a.votes));

  if (!authReady) return <div className="h-screen flex items-center justify-center text-zinc-500">Conectando...</div>;
  if (!currentUser) return <AuthScreen />;
  if (!currentUser.displayName) return <NicknameScreen user={currentUser} onSave={() => {}} />;

  return (
    <div className="min-h-screen p-2 md:p-6 max-w-6xl mx-auto flex flex-col md:flex-row gap-6">
      
      {/* SIDEBAR ÚNICA (ESQUERDA) */}
      <div className="md:w-64 flex flex-col gap-4">
          <div className="card p-4">
             <h2 className="text-zinc-400 text-xs font-bold uppercase mb-3">Meus Grupos</h2>
             <div className="flex flex-col gap-2 max-h-[200px] overflow-y-auto scrollbar-thin">
                 {myGroups.map(g => (
                     <button key={g.id} onClick={() => setActiveGroupId(g.id)} className={`text-left px-3 py-2 rounded-lg text-sm transition-all truncate ${activeGroupId === g.id ? "bg-indigo-600 text-white shadow-lg" : "hover:bg-white/5 text-zinc-400"}`}> {g.name} </button>
                 ))}
                 {myGroups.length === 0 && <span className="text-xs text-zinc-600 italic p-2">Sem grupos.</span>}
             </div>
             <div className="mt-4 grid grid-cols-2 gap-2">
                 <button onClick={() => setModalMode("create_group")} className="btn-primary text-xs py-2 px-1">Novo</button>
                 <button onClick={() => setModalMode("join_group")} className="bg-zinc-700 hover:bg-zinc-600 text-white text-xs py-2 px-1 rounded-lg">Entrar</button>
             </div>
          </div>

          <div className="card p-4 flex items-center gap-3 relative cursor-pointer hover:bg-white/5 transition-colors" onClick={() => openProfile({id: currentUser.uid, displayName: currentUser.displayName, photoURL: currentUser.photoURL})}>
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-lg font-bold overflow-hidden border-2 border-transparent hover:border-white transition-all">
                  {currentUser.photoURL ? <img src={currentUser.photoURL} alt="Avatar" className="w-full h-full object-cover" /> : currentUser.displayName[0]}
              </div>
              <div className="flex-1 overflow-hidden">
                  <div className="text-sm font-bold truncate">{currentUser.displayName}</div>
                  <div className="text-[10px] text-zinc-500">Ver meu perfil</div>
              </div>
          </div>

          {activeGroup && (
            <div className="card p-4 flex flex-col gap-2 flex-1 min-h-[200px]">
                <h2 className="text-zinc-400 text-xs font-bold uppercase mb-2">Membros ({groupMembers.length})</h2>
                <div className="flex-1 overflow-y-auto scrollbar-thin space-y-1 max-h-[300px]">
                    {groupMembers.map(u => {
                        const isOnline = isUserOnline(u.lastSeen);
                        const isAdmin = activeGroup.admins?.includes(u.id);
                        return (
                            <div key={u.id} className="group flex items-center gap-2 p-2 rounded hover:bg-white/5 transition-colors cursor-pointer">
                                <div className="relative" onClick={() => openProfile(u)}>
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold overflow-hidden ${isAdmin ? 'bg-amber-500/20 text-amber-500 ring-1 ring-amber-500/50' : 'bg-zinc-700 text-zinc-300'}`}>
                                        {u.photoURL ? <img src={u.photoURL} className="w-full h-full object-cover"/> : u.displayName[0]}
                                    </div>
                                    <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[#1e1e1e] ${isOnline ? 'bg-emerald-500' : 'bg-zinc-600'}`}></span>
                                </div>
                                <div className="flex-1 min-w-0" onClick={() => openProfile(u)}>
                                    <div className="text-sm font-medium truncate flex items-center gap-1">{u.displayName} {isAdmin && <span className="text-[10px]">👑</span>}</div>
                                    <div className="text-[10px] text-zinc-500">{isOnline ? 'Online' : 'Offline'}</div>
                                </div>
                                {isGroupAdmin && u.id !== currentUserId && (
                                    <div className="hidden group-hover:flex gap-1">
                                        {!isAdmin && <button onClick={() => { setModalMode("promote"); setModalData({id: u.id, name: u.displayName}); }} className="p-1 text-emerald-500 hover:bg-emerald-500/10 rounded">⬆</button>}
                                        <button onClick={() => { setModalMode("kick"); setModalData({id: u.id, name: u.displayName}); }} className="p-1 text-red-500 hover:bg-red-500/10 rounded">✕</button>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
          )}
      </div>

      {/* ÁREA CENTRAL */}
      <div className="flex-1 min-w-0 flex flex-col gap-4">
        {activeGroup ? (
            <motion.div key={activeGroupId} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="card p-0 overflow-hidden flex flex-col h-full min-h-[500px]">
                <div className="p-6 border-b border-white/5 bg-black/20 flex justify-between items-start">
                    <div>
                        <h1 className="text-2xl font-bold flex items-center gap-2">
                            {activeGroup.name}
                            {isGroupAdmin && <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded border border-indigo-500/30">ADMIN</span>}
                        </h1>
                        <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs text-zinc-500">ID: {activeGroup.id}</span>
                            <button onClick={copyInviteLink} className="text-xs text-emerald-400 font-bold bg-emerald-500/10 px-2 rounded hover:bg-emerald-500/20 transition-colors">🔗 LINK CONVITE</button>
                        </div>
                    </div>
                    <div className="flex gap-2">
                         <div className="bg-black/40 px-3 py-1 rounded text-center border border-white/5" title="Seus Fragmentos">
                            <div className="text-[10px] text-zinc-500 font-bold">FRAGMENTOS</div>
                            <div className="text-emerald-400 font-mono font-bold">{userData.fragmentos || 0}/10</div>
                         </div>
                         <div className="bg-black/40 px-3 py-1 rounded text-center border border-white/5" title="Seus Boosts">
                            <div className="text-[10px] text-zinc-500 font-bold">BOOSTS</div>
                            <div className="text-amber-400 font-mono font-bold">⚡ {userData.boosts || 0}</div>
                         </div>
                         <button onClick={() => setModalMode("leave_confirm")} className="text-zinc-500 hover:text-red-500 p-2" title="Sair">🚪</button>
                    </div>
                </div>
                
                <div className="flex border-b border-white/5">
                  <Tab label="Votar" active={activeTab === "pending"} onClick={() => setActiveTab("pending")} />
                  <Tab label="Meus" active={activeTab === "review"} onClick={() => setActiveTab("review")} />
                  <Tab label="Ranking" active={activeTab === "rank"} onClick={() => setActiveTab("rank")} />
                </div>

                <div className="flex-1 p-4 overflow-y-auto bg-black/10 space-y-4">
                    {((activeTab === "pending" ? pending : activeTab === "review" ? review : ranked)).length === 0 && <div className="text-center py-10 text-zinc-500">Vazio.</div>}
                    {((activeTab === "pending" ? pending : activeTab === "review" ? review : ranked)).map(s => (
                        <SuggestionCard key={s.id} s={s} currentUserId={currentUserId} isGroupAdmin={isGroupAdmin} 
                            onVote={(id, v) => vote(id, v)}
                            onBoost={applyBoost}
                            onDelete={(id) => { setModalMode("delete"); setModalData({id}); }}
                            onReport={(id) => { setModalMode("report"); setModalData({id}); }}
                            onDismiss={(id) => dismissReports(id)}
                            onProfileClick={(uid, name) => openProfile({id: uid, displayName: name, photoURL: groupMembers.find(m=>m.id===uid)?.photoURL})}
                            userHasBoosts={(userData.boosts || 0) > 0}
                        />
                    ))}
                </div>

                <div className="p-4 bg-black/20 border-t border-white/5">
                    <textarea value={newText} onChange={e => setNewText(e.target.value)} placeholder="Nova sugestão..." className="w-full bg-black/20 border border-white/10 rounded-lg p-3 text-sm text-white h-16 outline-none focus:border-indigo-500 resize-none mb-2" />
                    <div className="flex justify-end"><button onClick={createSuggestion} className="btn-primary py-1 px-4 text-sm">Enviar</button></div>
                </div>
            </motion.div>
        ) : (
            <div className="card h-full flex items-center justify-center p-10 text-center border-dashed border-2 border-zinc-700 bg-transparent">
                <button onClick={() => setModalMode("create_group")} className="btn-primary">Criar Grupo</button>
            </div>
        )}
      </div>

      <AnimatePresence>
        {toast && (
            <motion.div initial={{opacity:0, y:20}} animate={{opacity:1, y:0}} exit={{opacity:0, y:20}} className={`fixed bottom-6 left-1/2 transform -translate-x-1/2 px-6 py-3 rounded-full font-bold shadow-2xl z-[70] ${toast.type === "error" ? "bg-red-500 text-white" : "bg-emerald-500 text-black"}`}>
                {toast.msg}
            </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {modalMode === "create_group" && <Modal title="Novo Grupo" onClose={() => setModalMode(null)}> <form onSubmit={(e) => { e.preventDefault(); createGroup(e.target.gName.value); }}> <input name="gName" autoFocus className="input-neon mb-4" placeholder="Nome do Grupo" required /> <button className="btn-primary w-full">Criar</button> </form> </Modal>}
        {modalMode === "join_group" && <Modal title="Entrar" onClose={() => setModalMode(null)}> <form onSubmit={(e) => { e.preventDefault(); joinGroup(e.target.gId.value); }}> <input name="gId" autoFocus className="input-neon mb-4 text-center" placeholder="ID do Grupo" required /> <button className="btn-primary w-full">Entrar</button> </form> </Modal>}
        {modalMode === "leave_confirm" && ( <Modal title="Sair do Grupo?" onClose={() => setModalMode(null)}> <p className="mb-4 text-center text-zinc-300">Você precisará do ID ou link de convite para entrar novamente.</p> <div className="flex gap-2"> <button onClick={() => setModalMode(null)} className="flex-1 btn-ghost">Ficar</button> <button onClick={handleLeaveGroup} className="flex-1 bg-red-500 text-black font-bold p-2 rounded hover:bg-red-400">Sair</button> </div> </Modal>)}
        {modalMode === "delete" && <Modal title="Apagar?" onClose={() => setModalMode(null)}> <p className="mb-4 text-center text-zinc-300">Apagar esta sugestão?</p> <div className="flex gap-2"> <button onClick={() => setModalMode(null)} className="flex-1 btn-ghost">Cancelar</button> <button onClick={() => deleteSuggestion(modalData.id)} className="flex-1 bg-red-500 text-black font-bold p-2 rounded">Apagar</button> </div> </Modal>}
        {modalMode === "report" && <Modal title="Denunciar" onClose={() => setModalMode(null)}> <form onSubmit={(e) => { e.preventDefault(); reportSuggestion(modalData.id, e.target.reason.value); }}> <p className="text-sm text-zinc-400 mb-2">Por que isso é inapropriado?</p> <textarea name="reason" autoFocus className="input-neon mb-4 h-24 resize-none" placeholder="Ex: Conteúdo ofensivo, spam..." required></textarea> <button className="bg-red-500 hover:bg-red-400 text-black font-bold w-full py-2 rounded">Enviar Denúncia</button> </form> </Modal>}
        {modalMode === "promote" && <Modal title="Promover" onClose={() => setModalMode(null)}> <p className="mb-4 text-center">Tornar <b>{modalData.name}</b> Admin?</p> <div className="flex gap-2"><button onClick={() => setModalMode(null)} className="flex-1 btn-ghost">Não</button><button onClick={() => manageMember("promote", modalData.id)} className="flex-1 bg-emerald-500 text-black font-bold rounded p-2">Sim</button></div> </Modal>}
        {modalMode === "kick" && <Modal title="Banir" onClose={() => setModalMode(null)}> <p className="mb-4 text-center">Remover <b>{modalData.name}</b>?</p> <div className="flex gap-2"><button onClick={() => setModalMode(null)} className="flex-1 btn-ghost">Não</button><button onClick={() => manageMember("kick", modalData.id)} className="flex-1 bg-red-500 text-black font-bold rounded p-2">Sim</button></div> </Modal>}

        {/* MODAL DE PERFIL (COM INPUT DE LINK) */}
        {modalMode === "profile" && (
            <Modal title="Perfil" onClose={() => setModalMode(null)}>
                <div className="text-center mb-6">
                    <div className="w-24 h-24 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-3xl font-bold mx-auto mb-3 border-4 border-[#252525] overflow-hidden relative group">
                        {modalData.user.photoURL ? <img src={modalData.user.photoURL} className="w-full h-full object-cover"/> : modalData.user.displayName[0]}
                    </div>
                    
                    {/* Botão de Editar Foto (DENTRO DO MODAL - LINK) */}
                    {modalData.user.id === currentUser.uid && (
                        <div className="mb-4">
                            <button onClick={() => setAvatarUrlInput(old => old ? "" : "open")} className="text-xs bg-white/5 hover:bg-white/10 px-3 py-1 rounded-full text-zinc-400 transition-colors">✏️ Alterar Foto</button>
                            {avatarUrlInput === "open" && (
                                <form onSubmit={(e) => { e.preventDefault(); handleUpdateAvatar(e.target.url.value); }} className="mt-2 animate-in fade-in slide-in-from-top-2">
                                    <input name="url" autoFocus className="input-neon text-xs p-2 mb-2 w-full" placeholder="Cole o link (https://...)" required />
                                    <button className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold w-full py-1 rounded">Salvar</button>
                                </form>
                            )}
                        </div>
                    )}

                    <h2 className="text-xl font-bold">{modalData.user.displayName}</h2>
                </div>
                
                <div className="grid grid-cols-2 gap-3 mb-6">
                    <div className="bg-black/30 p-3 rounded-lg text-center border border-white/5">
                        <div className="text-2xl font-bold text-white">{modalData.stats.count}</div>
                        <div className="text-[10px] text-zinc-500 uppercase">Sugestões</div>
                    </div>
                    <div className="bg-black/30 p-3 rounded-lg text-center border border-white/5">
                        <div className="text-2xl font-bold text-emerald-400">{modalData.stats.score}</div>
                        <div className="text-[10px] text-zinc-500 uppercase">Reputação</div>
                    </div>
                </div>
                <div className="text-xs text-zinc-500 uppercase font-bold mb-2">Últimas Atividades</div>
                <div className="max-h-40 overflow-y-auto space-y-2 pr-1 scrollbar-thin">
                    {modalData.history.length === 0 && <p className="text-sm text-zinc-600 italic">Nenhuma atividade recente.</p>}
                    {modalData.history.map(h => (
                        <div key={h.id} className="bg-white/5 p-2 rounded text-sm text-zinc-300 truncate border-l-2 border-indigo-500">
                            {h.content.text}
                        </div>
                    ))}
                </div>
            </Modal>
        )}
      </AnimatePresence>
    </div>
  );
}

// ===================== COMPONENTES VISUAIS =====================

function SuggestionCard({ s, currentUserId, isGroupAdmin, onVote, onBoost, onDelete, onReport, onDismiss, onProfileClick, userHasBoosts }) {
    const score = scoreFromVotes(s.votes);
    const isAuthor = s.author === currentUserId;
    const canDelete = isAuthor || isGroupAdmin; 
    const reportCount = s.reports ? s.reports.length : 0;
    const userVotes = s.votes?.[currentUserId] || [];
    const hasVoted = userVotes.length > 0;
    const boostUsed = userVotes.length > 1;

    return (
        <motion.div initial={{opacity:0, y:10}} animate={{opacity:1, y:0}} className={`relative p-4 rounded-xl border ${isAuthor ? "bg-indigo-900/10 border-indigo-500/30" : "bg-[#252525] border-white/5"} ${isGroupAdmin && reportCount > 0 ? "border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.2)]" : ""}`}>
            <div className="flex justify-between items-start mb-2">
                <span onClick={() => onProfileClick(s.author, s.authorName)} className="text-xs font-bold text-zinc-400 hover:text-indigo-400 hover:underline cursor-pointer transition-colors">{s.authorName}</span>
                <span className="text-[10px] text-zinc-600">{new Date(s.createdAt).toLocaleDateString()}</span>
            </div>
            <p className="text-sm text-zinc-200 whitespace-pre-wrap mb-3">{s.content.text}</p>
            {isGroupAdmin && reportCount > 0 && (
                <div className="bg-red-500/10 border border-red-500/20 p-2 rounded mb-3">
                    <div className="text-xs font-bold text-red-400 mb-1">⚠️ {reportCount} Denúncia(s):</div>
                    <ul className="text-[10px] text-zinc-400 list-disc list-inside mb-2">{s.reports.map((r, i) => <li key={i}>{r.reason}</li>)}</ul>
                    <div className="flex gap-2">
                        <button onClick={() => onDismiss(s.id)} className="text-[10px] bg-white/10 hover:bg-white/20 text-white px-2 py-1 rounded">Ignorar</button>
                        <button onClick={() => onDelete(s.id)} className="text-[10px] bg-red-500 hover:bg-red-400 text-black font-bold px-2 py-1 rounded">Apagar</button>
                    </div>
                </div>
            )}
            <div className="flex justify-between items-center border-t border-white/5 pt-2">
                <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${score > 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-zinc-800 text-zinc-500'}`}>{score} pts</span>
                <div className="flex gap-1 items-center">
                    <button onClick={() => onVote(s.id, 1)} className="w-8 h-8 flex items-center justify-center rounded hover:bg-white/10">👍</button>
                    <button onClick={() => onVote(s.id, -1)} className="w-8 h-8 flex items-center justify-center rounded hover:bg-white/10">👎</button>
                    {!isAuthor && hasVoted && !boostUsed && (
                        <button onClick={() => onBoost(s.id)} className={`ml-2 border font-bold p-1 rounded transition-all text-xs ${userHasBoosts ? "bg-amber-500/10 text-amber-500 border-amber-500/30 hover:bg-amber-500 hover:text-black" : "opacity-50 cursor-not-allowed border-zinc-700 text-zinc-500"}`} title={userHasBoosts ? "Dar Boost" : "Sem Boosts"}>⚡ BOOST</button>
                    )}
                    {boostUsed && <span className="ml-2 text-xs text-amber-500/50 italic">Boostado</span>}
                    {!isAuthor && <button onClick={() => onReport(s.id)} className="w-8 h-8 flex items-center justify-center rounded hover:bg-red-500/20 text-zinc-600 hover:text-red-400 transition-colors ml-2" title="Denunciar">🚩</button>}
                </div>
            </div>
            {canDelete && (!isGroupAdmin || reportCount === 0) && <button onClick={() => onDelete(s.id)} className="absolute top-2 right-2 text-zinc-600 hover:text-red-500 p-1">🗑️</button>}
        </motion.div>
    );
}

function Tab({ label, active, onClick }) { return <button onClick={onClick} className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${active ? "border-indigo-500 text-white bg-white/5" : "border-transparent text-zinc-500 hover:text-zinc-300"}`}>{label}</button>; }
function Modal({ title, children, onClose }) { return ( <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[60] p-4"> <motion.div initial={{scale:0.95, opacity:0}} animate={{scale:1, opacity:1}} exit={{scale:0.95, opacity:0}} className="card w-full max-w-sm p-6 shadow-2xl border-indigo-500/20"> <div className="flex justify-between items-center mb-4"> <h2 className="text-xl font-bold text-white">{title}</h2> <button onClick={onClose} className="text-zinc-500 hover:text-white">✕</button> </div> {children} </motion.div> </div> ); }

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);