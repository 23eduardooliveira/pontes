// Removemos os 'import' e pegamos das variáveis globais do navegador
const { useState, useEffect, useMemo } = React;
// No CDN, o Framer Motion exporta tudo dentro de um objeto global, mas para simplificar
// vamos usar o destructuring do objeto window.Motion se disponível ou pegar direto.
const { motion, AnimatePresence } = window.Motion; 

// =====================
// CONFIG / MOCK BACKEND
// =====================

const MOCK_USERS = [
  { id: "u1", name: "Alice" },
  { id: "u2", name: "Bruno" },
  { id: "u3", name: "Carla" },
  { id: "u4", name: "Diego" }
];

const CURRENT_USER_ID = "u1";

// =====================
// HELPERS
// =====================

const scoreFromVotes = (votes) =>
  Object.values(votes || {}).reduce(
    (acc, arr) => acc + arr.reduce((a, b) => a + b, 0),
    0
  );

const votedCount = (votes, authorId) =>
  Object.keys(votes || {}).filter((uid) => uid !== authorId).length;

const userHasVoted = (votes) => Boolean(votes?.[CURRENT_USER_ID]?.length);

const userBoostUsed = (votes) => (votes?.[CURRENT_USER_ID] || []).length > 1;

// =====================
// APP
// =====================

function App() {
  const [users] = useState(MOCK_USERS);

  // Boards
  const [boards, setBoards] = useState([
    { id: "b1", name: "Suggestion Board", archived: false, adminId: CURRENT_USER_ID }
  ]);
  const [activeBoardId, setActiveBoardId] = useState("b1");

  // UI
  const [editingBoardId, setEditingBoardId] = useState(null);
  const [activeTab, setActiveTab] = useState("pending");
  const [usersPanelOpen, setUsersPanelOpen] = useState(true);

  // Data
  const [suggestions, setSuggestions] = useState({ b1: [] });
  const [newText, setNewText] = useState("");
  const [newImage, setNewImage] = useState(null);

  // ECONOMY PER BOARD
  const [economy, setEconomy] = useState({
    b1: { fragmentos: 0, boosts: 0 }
  });

  const [confirmBoost, setConfirmBoost] = useState(null);

  // =====================
  // ECONOMY LOGIC
  // =====================

  useEffect(() => {
    const e = economy[activeBoardId];
    if (!e) return;

    if (e.fragmentos >= 10) {
      const gained = Math.floor(e.fragmentos / 10);
      setEconomy((prev) => ({
        ...prev,
        [activeBoardId]: {
          fragmentos: e.fragmentos % 10,
          boosts: e.boosts + gained
        }
      }));
    }
  }, [economy, activeBoardId]);

  // =====================
  // BOARD ACTIONS
  // =====================

  const createBoard = () => {
    const id = crypto.randomUUID();
    setBoards((b) => [...b, { id, name: "Nova Board", archived: false, adminId: CURRENT_USER_ID }]);
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
    if (!board || board.adminId !== CURRENT_USER_ID) return;

    setBoards((b) => b.map((bd) => (bd.id === id ? { ...bd, archived: true } : bd)));
  };

  const unarchiveBoard = (id) => {
    const board = boards.find((b) => b.id === id);
    if (!board || board.adminId !== CURRENT_USER_ID) return;

    setBoards((b) => b.map((bd) => (bd.id === id ? { ...bd, archived: false } : bd)));
    setActiveBoardId(id);
  };

  const activeBoard = boards.find((b) => b.id === activeBoardId);
  const isArchivedBoard = activeBoard?.archived;
  const isAdmin = activeBoard?.adminId === CURRENT_USER_ID;
  const currentSuggestions = suggestions[activeBoardId] || [];

  // =====================
  // SUGGESTIONS ACTIONS
  // =====================

  const createSuggestion = () => {
    if (isArchivedBoard) return;
    if (!newText.trim() && !newImage) return;

    setSuggestions((prev) => ({
      ...prev,
      [activeBoardId]: [
        ...(prev[activeBoardId] || []),
        {
          id: crypto.randomUUID(),
          author: CURRENT_USER_ID,
          createdAt: new Date().toISOString(),
          content: { text: newText, image: newImage },
          votes: {}
        }
      ]
    }));

    setNewText("");
    setNewImage(null);
  };

  const applyBoost = (id) => {
    if (isArchivedBoard) return;

    const boardEco = economy[activeBoardId];
    if (!boardEco || boardEco.boosts <= 0) return;

    setSuggestions((prev) => ({
      ...prev,
      [activeBoardId]: prev[activeBoardId].map((s) => {
        if (s.id !== id) return s;
        const userVotes = s.votes[CURRENT_USER_ID] || [];
        if (userBoostUsed(s.votes)) return s;

        let appliedValue = 1;
        if (s.author !== CURRENT_USER_ID) {
          const lastVote = userVotes[userVotes.length - 1];
          if (lastVote === 0) {
            const score = scoreFromVotes(s.votes);
            appliedValue = score > 0 ? -1 : score < 0 ? 1 : 0;
          } else if (typeof lastVote === "number") {
            appliedValue = lastVote;
          }
        }

        const updatedVotes = {
          ...s.votes,
          [CURRENT_USER_ID]: [...userVotes, appliedValue]
        };

        setEconomy((e) => ({
          ...e,
          [activeBoardId]: {
            fragmentos: e[activeBoardId].fragmentos,
            boosts: e[activeBoardId].boosts - 1
          }
        }));

        return { ...s, votes: updatedVotes, _boosted: true };
      })
    }));
  };

  const voteInitial = (id, value) => {
    if (isArchivedBoard) return;

    setSuggestions((prev) => ({
      ...prev,
      [activeBoardId]: prev[activeBoardId].map((s) => {
        if (s.id !== id) return s;
        if (s.author === CURRENT_USER_ID) return s;
        if (userHasVoted(s.votes)) return s;

        setEconomy((e) => ({
          ...e,
          [activeBoardId]: {
            ...e[activeBoardId],
            fragmentos: e[activeBoardId].fragmentos + 1
          }
        }));

        return {
          ...s,
          votes: { ...s.votes, [CURRENT_USER_ID]: [value] }
        };
      })
    }));
  };

  const minVotes = Math.ceil((users.length - 1) * 0.3);

  const pending = currentSuggestions.filter(
    (s) => !userHasVoted(s.votes) && s.author !== CURRENT_USER_ID
  );

  const review = currentSuggestions.filter(
    (s) => userHasVoted(s.votes) || s.author === CURRENT_USER_ID
  );

  const ranked = currentSuggestions
    .filter((s) => votedCount(s.votes, s.author) >= minVotes)
    .sort((a, b) => scoreFromVotes(b.votes) - scoreFromVotes(a.votes));

  // =====================
  // USERS PANEL
  // =====================

  const usersByActivity = useMemo(() => {
    const activity = {};

    currentSuggestions.forEach((s) => {
      Object.keys(s.votes || {}).forEach((uid) => {
        activity[uid] = Math.max(activity[uid] || 0, new Date(s.createdAt).getTime());
      });
    });

    return [...users].sort((a, b) => (activity[b.id] || 0) - (activity[a.id] || 0));
  }, [users, currentSuggestions]);

  // =====================
  // RENDER
  // =====================

  return (
    <div className="min-h-screen text-zinc-200 p-4 max-w-md mx-auto flex gap-3">
      {/* USERS PANEL */}
      <div className={`bg-[#1a1a1a] rounded p-2 transition-all duration-300 ${usersPanelOpen ? "w-28" : "w-8"}`}>
        <button
          className="text-xs text-zinc-400 mb-2 w-full text-left"
          onClick={() => setUsersPanelOpen((v) => !v)}
        >
          👥
        </button>

        {usersPanelOpen && (
          <div className="space-y-1">
            {usersByActivity.map((u) => (
              <div key={u.id} className="flex items-center gap-1 text-xs">
                <span>{u.name}</span>
                {activeBoard?.adminId === u.id && <span title="Administrador">⭐</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* MAIN */}
      <div className="flex-1">
        {/* BOARDS BAR */}
        <div className="flex gap-2 mb-3 overflow-x-auto pb-2">
          {boards.filter((b) => !b.archived).map((b) => (
            <button
              key={b.id}
              onClick={() => setActiveBoardId(b.id)}
              className={`px-3 py-1 rounded text-sm whitespace-nowrap ${
                b.id === activeBoardId ? "bg-indigo-600" : "bg-[#2b2b2b]"
              }`}
            >
              {b.name}
            </button>
          ))}
          <button onClick={createBoard} className="px-2 py-1 bg-green-600 rounded whitespace-nowrap">+</button>
        </div>

        {/* BOARD HEADER */}
        {activeBoard && (
          <header className="mb-4 space-y-1">
            {editingBoardId === activeBoard.id ? (
              <input
                autoFocus
                className="bg-[#252525] p-1 rounded text-sm text-white w-full"
                defaultValue={activeBoard.name}
                onBlur={(e) => renameBoard(activeBoard.id, e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && renameBoard(activeBoard.id, e.target.value)}
              />
            ) : (
              <h1
                className="text-lg font-semibold cursor-pointer hover:text-indigo-400"
                onClick={() => setEditingBoardId(activeBoard.id)}
              >
                {activeBoard.name} ✎
              </h1>
            )}

            <div className="flex justify-between items-center">
                <div className="text-xs text-zinc-400">
                🧩 {economy[activeBoardId]?.fragmentos || 0} · ⚡ {economy[activeBoardId]?.boosts || 0}
                </div>
                
                {isAdmin && !isArchivedBoard && (
                <button
                    onClick={() => archiveBoard(activeBoard.id)}
                    className="text-xs text-zinc-500 hover:text-red-400"
                >
                    Arquivar
                </button>
                )}
                
                {isAdmin && isArchivedBoard && (
                 <button
                    onClick={() => unarchiveBoard(activeBoard.id)}
                    className="text-xs text-green-400"
                  >
                    Desarquivar
                  </button>
                )}
            </div>
          </header>
        )}

        {/* TABS */}
        <div className="flex gap-2 mb-4">
          <Tab icon="⏳" active={activeTab === "pending"} onClick={() => setActiveTab("pending")} />
          <Tab icon="📝" active={activeTab === "review"} onClick={() => setActiveTab("review")} />
          <Tab icon="📊" active={activeTab === "rank"} onClick={() => setActiveTab("rank")} />
        </div>

        <AnimatePresence mode="wait">
          {activeTab === "pending" && (
            <Panel
              key="pending"
              list={pending}
              onVote={isArchivedBoard ? undefined : voteInitial}
              onBoost={isArchivedBoard ? undefined : setConfirmBoost}
              boosts={economy[activeBoardId]?.boosts || 0}
              mode="initial"
            />
          )}
          {activeTab === "review" && (
            <Panel
               key="review"
              list={review}
              onVote={isArchivedBoard ? undefined : voteInitial}
              onBoost={isArchivedBoard ? undefined : setConfirmBoost}
              boosts={economy[activeBoardId]?.boosts || 0}
              mode="review"
            />
          )}
          {activeTab === "rank" && (
            <Panel
               key="rank"
              list={ranked}
              onVote={isArchivedBoard ? undefined : voteInitial}
              onBoost={isArchivedBoard ? undefined : setConfirmBoost}
              boosts={economy[activeBoardId]?.boosts || 0}
              mode="rank"
            />
          )}
        </AnimatePresence>

        {/* CREATE SUGGESTION */}
        <div className="mt-4 border-t border-zinc-700 pt-3 space-y-2">
          <textarea
            disabled={isArchivedBoard}
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            placeholder="Texto da sugestão…"
            className="w-full bg-[#252525] p-2 rounded text-sm text-white resize-none h-20"
          />
          <div className="flex gap-2">
              <input
                disabled={isArchivedBoard}
                type="file"
                accept="image/*"
                className="text-xs text-zinc-400"
                onChange={(e) => e.target.files && setNewImage(URL.createObjectURL(e.target.files[0]))}
              />
              <button
                disabled={isArchivedBoard}
                onClick={createSuggestion}
                className="flex-1 bg-indigo-600 py-1 rounded disabled:opacity-40 text-sm font-bold"
              >
                Enviar
              </button>
          </div>
        </div>

        {/* CONFIRM BOOST */}
        <AnimatePresence>
          {confirmBoost && (
            <ConfirmModal
              onCancel={() => setConfirmBoost(null)}
              onConfirm={() => {
                applyBoost(confirmBoost);
                setConfirmBoost(null);
              }}
            />
          )}
        </AnimatePresence>

        {/* ARCHIVED BOARDS */}
        {boards.some(b => b.archived) && (
            <div className="mt-6 border-t border-zinc-700 pt-3">
            <div className="text-xs text-zinc-400 mb-2">Boards arquivados</div>
            {boards.filter((b) => b.archived).map((b) => (
                <div key={b.id} className="flex items-center justify-between text-sm text-zinc-500 mb-1">
                <span>{b.name}</span>
                {b.adminId === CURRENT_USER_ID && (
                    <button
                    onClick={() => unarchiveBoard(b.id)}
                    className="text-xs text-green-400 hover:underline"
                    >
                    Restaurar
                    </button>
                )}
                </div>
            ))}
            </div>
        )}
      </div>
    </div>
  );
}

// =====================
// COMPONENTS
// =====================

function Tab({ active, onClick, icon }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 py-2 rounded text-xl transition-colors ${active ? "bg-[#2b2b2b] text-white" : "bg-[#1a1a1a] text-zinc-500 hover:bg-[#252525]"}`}
    >
      {icon}
    </button>
  );
}

function Panel({ list, onVote, onBoost, boosts, mode }) {
  return (
    <motion.div 
        initial={{ opacity: 0, x: 10 }} 
        animate={{ opacity: 1, x: 0 }} 
        exit={{ opacity: 0, x: -10 }}
        transition={{ duration: 0.2 }}
    >
      {list.length === 0 && <div className="text-center text-zinc-500 text-sm py-4">Nada aqui por enquanto.</div>}
      {list.map((s) => (
        <SuggestionCard
          key={s.id}
          s={s}
          onVote={onVote}
          onBoost={onBoost}
          boosts={boosts}
          mode={mode}
        />
      ))}
    </motion.div>
  );
}

function SuggestionCard({ s, onVote, onBoost, boosts, mode }) {
  const score = scoreFromVotes(s.votes);
  const [pulse, setPulse] = useState(false);
  const isAuthor = s.author === CURRENT_USER_ID;
  const boostUsed = userBoostUsed(s.votes);

  const interactionsDisabled = !onVote && !onBoost;

  useEffect(() => {
    if (s._boosted) {
      setPulse(true);
      setTimeout(() => setPulse(false), 400);
    }
  }, [s._boosted]);

  return (
    <motion.div
      animate={pulse ? { boxShadow: "0 0 0 2px rgba(251,191,36,0.9)", scale: 1.02 } : { scale: 1 }}
      initial={{ opacity: 0, y: 10 }}
      whileHover={{ scale: 1.01 }}
      className={`mb-3 p-3 rounded border space-y-2 relative overflow-hidden ${
        isAuthor ? "bg-[#2a2438] border-indigo-500/50" : "bg-[#252525] border-zinc-700"
      }`}
    >
      {s.content.text && <div className="text-sm whitespace-pre-wrap">{s.content.text}</div>}
      {s.content.image && <img src={s.content.image} className="rounded max-h-40 w-full object-cover" />}

      <div className="flex justify-between items-center mt-2">
          <motion.div key={score} initial={{ scale: 1.3, color: "#fff" }} animate={{ scale: 1, color: "#aaa" }} className="text-xs font-mono">
            Score: {score}
          </motion.div>

          <div className="flex gap-2 items-center">
            <button
              className="hover:bg-zinc-700 p-1 rounded"
              onClick={() => onVote && onVote(s.id, 1)}
              disabled={mode !== "initial" || interactionsDisabled}
              title="Aprovar (+1)"
            >
              👍
            </button>
            <button
              className="hover:bg-zinc-700 p-1 rounded"
              onClick={() => onVote && onVote(s.id, 0)}
              disabled={mode !== "initial" || interactionsDisabled}
              title="Neutro (0)"
            >
              ➖
            </button>
            <button
              className="hover:bg-zinc-700 p-1 rounded"
              onClick={() => onVote && onVote(s.id, -1)}
              disabled={mode !== "initial" || interactionsDisabled}
              title="Reprovar (-1)"
            >
              👎
            </button>

            {(mode === "review" || mode === "rank") &&
              boosts > 0 &&
              !boostUsed &&
              !interactionsDisabled && (
                <motion.button 
                    whileTap={{ scale: 0.85 }} 
                    onClick={() => onBoost(s.id)}
                    className="ml-2 bg-amber-600/20 text-amber-500 px-2 rounded hover:bg-amber-600/40"
                    title="Usar Boost"
                >
                  ⚡
                </motion.button>
              )}
          </div>
      </div>
    </motion.div>
  );
}

function ConfirmModal({ onConfirm, onCancel }) {
  return (
    <motion.div
      className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        className="bg-[#252525] p-6 rounded-lg border border-zinc-600 space-y-4 max-w-xs shadow-2xl"
      >
        <h3 className="text-lg font-bold text-amber-500">Usar Boost? ⚡</h3>
        <p className="text-sm text-zinc-300">
            Isso vai gastar <strong>1 Boost</strong> e aumentar permanentemente a relevância desta sugestão.
        </p>
        <div className="flex gap-3 pt-2">
          <button onClick={onCancel} className="flex-1 bg-zinc-700 hover:bg-zinc-600 rounded py-2 text-sm">
            Cancelar
          </button>
          <button onClick={onConfirm} className="flex-1 bg-amber-600 hover:bg-amber-500 rounded py-2 text-sm font-bold text-black">
            Confirmar
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// INICIALIZAÇÃO DO REACT 18
const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);