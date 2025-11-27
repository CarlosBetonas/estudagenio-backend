require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const User = require('./models/User');
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
app.use(cors()); 
app.use(express.json());
const path = require('path'); 

app.use(express.static(__dirname));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/cadastro', (req, res) => {
  res.sendFile(path.join(__dirname, 'cadastro.html'));
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard.html'));
});

// --- CONEXÃO COM MONGODB ATLAS ---
const MONGO_URI = "mongodb+srv://estudagenio_user:MBKjMNrMBT8R7@futurefast.ezadffc.mongodb.net/?appName=FutureFast";

mongoose.connect(MONGO_URI)
    .then(() => console.log('MongoDB Conectado!'))
    .catch(err => console.log('Erro ao conectar Mongo:', err));

// --- MODELOS ---

// 1. Histórico
const HistorySchema = new mongoose.Schema({
    userId: { type: String, required: true },
    title: String,          // Ex: "Simulado Geral"
    date: String,           // Ex: "27/11/2025"
    score: String,          // Ex: "8/10" (Visual)
    
    // --- NOVOS CAMPOS PARA O DASHBOARD ---
    totalQuestions: { type: Number, default: 0 }, // Total de questões feitas
    correctCount: { type: Number, default: 0 },   // Total de acertos
    timeSpentSeconds: { type: Number, default: 0 }, // Tempo gasto em segundos
    
    // Detalhamento por matéria (Crucial para o gráfico)
    subjectsBreakdown: [{
        subject: String, // Ex: "Matemática"
        total: Number,   // Quantas questões dessa matéria
        correct: Number  // Quantas acertou
    }],
    // -------------------------------------
    
    createdAt: { type: Date, default: Date.now }
});
const History = mongoose.model('History', HistorySchema);

// 2. Fórum
const ReplySchema = new mongoose.Schema({
    author: String,
    content: String,
    createdAt: { type: Date, default: Date.now }
});
const TopicSchema = new mongoose.Schema({
    userId: String,
    author: String,
    title: String,
    content: String,
    replies: [ReplySchema],
    createdAt: { type: Date, default: Date.now }
});
const Topic = mongoose.model('Topic', TopicSchema);

// 3. Questões (NOVO)
const QuestionSchema = new mongoose.Schema({
    exam: String,
    subject: String,
    difficulty: String,
    theme: String,
    statement: String,
    options: [String],
    answer: String
});
const Question = mongoose.model('Question', QuestionSchema);

// 4. Favoritos de Questões
const FavoriteSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    questionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Question', required: true },
    createdAt: { type: Date, default: Date.now }
});
const Favorite = mongoose.model('Favorite', FavoriteSchema);


// --- ROTAS ---

// 1. Registro
app.post('/register', async (req, res) => {
    try {
        const { fullName, email, password, birthDate, terms } = req.body;
        const userExists = await User.findOne({ email });
        if (userExists) return res.status(400).json({ msg: "Email já cadastrado." });

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newUser = new User({
            fullName,
            email,
            password: hashedPassword,
            birthDate,
            termsAccepted: terms
        });

        await newUser.save();
        res.status(201).json({ msg: "Usuário criado!", userId: newUser._id, fullName: newUser.fullName });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 2. Login
app.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        
        if (!user) return res.status(400).json({ msg: "Usuário não encontrado." });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ msg: "Senha incorreta." });

        res.json({ msg: "Login sucesso!", userId: user._id, fullName: user.fullName });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 3. Preferências
app.post('/update-preferences', async (req, res) => {
    try {
        const { userId, exams, subjects, goal, isPremium } = req.body;
        let updateData = {};
        if (exams) updateData['preferences.exams'] = exams;
        if (subjects) updateData['preferences.subjects'] = subjects;
        if (goal) updateData['preferences.goal'] = goal;
        if (isPremium !== undefined) updateData['preferences.isPremium'] = isPremium;

        await User.findByIdAndUpdate(userId, { $set: updateData });
        res.json({ msg: "Preferências atualizadas!" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 4. Reset Senha
app.post('/reset-password', async (req, res) => {
    try {
        const { email, newPassword } = req.body;
        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ msg: "E-mail não encontrado." });

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);
        user.password = hashedPassword;
        await user.save();
        res.json({ msg: "Senha alterada!" });
    } catch (error) {
        res.status(500).json({ error: "Erro interno." });
    }
});

// 5. Dados Usuário
app.get('/api/user/:id', async (req, res) => {
    try {
        const user = await User.findById(req.params.id).select('-password');
        if (!user) return res.status(404).json({ msg: "Usuário não encontrado" });
        res.json({ userId: user._id, fullName: user.fullName, email: user.email, preferences: user.preferences });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 6. Histórico
app.post('/api/history', async (req, res) => {
    try {
        // Recebe os novos dados do Front-end
        const { userId, title, date, score, totalQuestions, correctCount, timeSpentSeconds, subjectsBreakdown } = req.body;
        
        const newHistory = new History({ 
            userId, 
            title, 
            date, 
            score,
            totalQuestions,
            correctCount,
            timeSpentSeconds,
            subjectsBreakdown
        });

        await newHistory.save();
        res.status(201).json({ msg: "Histórico salvo!" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/history', async (req, res) => {
    try {
        const { userId } = req.query;
        const history = await History.find({ userId }).sort({ createdAt: -1 });
        res.json(history);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 7. Fórum
app.post('/api/forum', async (req, res) => {
    try {
        const { userId, author, title, content } = req.body;
        const newTopic = new Topic({ userId, author, title, content });
        await newTopic.save();
        res.status(201).json(newTopic);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/forum', async (req, res) => {
    try {
        const topics = await Topic.find().sort({ createdAt: -1 });
        res.json(topics);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/forum/:id/reply', async (req, res) => {
    try {
        const { author, content } = req.body;
        const topic = await Topic.findById(req.params.id);
        if (!topic) return res.status(404).json({ msg: "Tópico não encontrado" });
        topic.replies.push({ author, content });
        await topic.save();
        res.json(topic);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 8. QUESTÕES (NOVO SISTEMA)

// Buscar todas as questões (com filtros opcionais)
app.get('/api/questions', async (req, res) => {
    try {
        const { theme, exam, difficulty } = req.query;
        let query = {};
        if (theme) query.theme = { $regex: theme, $options: 'i' };
        if (exam) query.exam = exam;
        if (difficulty) query.difficulty = difficulty;

        const questions = await Question.find(query);
        res.json(questions);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 9. Favoritos de Questões

// Listar favoritos de um usuário
app.get('/api/favorites', async (req, res) => {
    try {
        const { userId } = req.query;
        if (!userId) return res.status(400).json({ msg: "userId é obrigatório" });

        const favs = await Favorite.find({ userId }).populate('questionId');
        const result = favs.map(f => ({
            id: f._id,
            questionId: f.questionId?._id,
            question: f.questionId,
            createdAt: f.createdAt
        }));

        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Adicionar aos favoritos
app.post('/api/favorites', async (req, res) => {
    try {
        const { userId, questionId } = req.body;
        if (!userId || !questionId) {
            return res.status(400).json({ msg: "userId e questionId são obrigatórios" });
        }

        let fav = await Favorite.findOne({ userId, questionId });
        if (!fav) {
            fav = new Favorite({ userId, questionId });
            await fav.save();
        }

        res.status(201).json(fav);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Remover dos favoritos
app.delete('/api/favorites', async (req, res) => {
    try {
        const { userId, questionId } = req.query;
        if (!userId || !questionId) {
            return res.status(400).json({ msg: "userId e questionId são obrigatórios" });
        }

        await Favorite.findOneAndDelete({ userId, questionId });
        res.json({ msg: "Removido dos favoritos" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


// Popular banco de dados (SEED) - Rota utilitária
app.post('/api/questions/seed', async (req, res) => {
    try {
        // DICA: Se quiser "resetar" e apagar as antigas para por as novas, descomente a linha abaixo:
        // await Question.deleteMany({}); 

        // Só popula se estiver vazio para não duplicar (se não usou o deleteMany acima)
        const count = await Question.countDocuments();
        if (count > 0) return res.json({ msg: "Banco de questões já populado. (Se quiser atualizar, limpe o banco antes)" });

        const initialQuestions = [
            // --- MATEMÁTICA ---
            { exam: 'ENEM', subject: 'Matemática', difficulty: 'Média', theme: 'Probabilidade', statement: 'Em um sorteio com 10 bolas numeradas de 1 a 10, qual a probabilidade de sortear um número par?', options: ['A) 10%', 'B) 20%', 'C) 40%', 'D) 50%', 'E) 60%'], answer: 'D) 50%' },
            { exam: 'FUVEST', subject: 'Matemática', difficulty: 'Difícil', theme: 'Geometria Analítica', statement: 'A distância entre os pontos A(1, 2) e B(4, 6) é:', options: ['A) 3', 'B) 4', 'C) 5', 'D) 6', 'E) 7'], answer: 'C) 5' },
            { exam: 'UNICAMP', subject: 'Matemática', difficulty: 'Fácil', theme: 'Funções', statement: 'Se f(x) = 2x + 3, qual o valor de f(5)?', options: ['A) 10', 'B) 13', 'C) 8', 'D) 15', 'E) 12'], answer: 'B) 13' },
            { exam: 'ENEM', subject: 'Matemática', difficulty: 'Média', theme: 'Porcentagem', statement: 'Um produto custava R$ 100,00 e teve um aumento de 20%. Em seguida, teve um desconto de 20%. Qual o preço final?', options: ['A) R$ 100,00', 'B) R$ 96,00', 'C) R$ 90,00', 'D) R$ 104,00', 'E) R$ 120,00'], answer: 'B) R$ 96,00' },
            { exam: 'VUNESP', subject: 'Matemática', difficulty: 'Fácil', theme: 'Médias', statement: 'A média aritmética entre 10, 20 e 30 é:', options: ['A) 15', 'B) 20', 'C) 25', 'D) 30', 'E) 35'], answer: 'B) 20' },

            // --- FÍSICA ---
            { exam: 'FUVEST', subject: 'Física', difficulty: 'Difícil', theme: 'Cinemática', statement: 'Um projétil é lançado com um ângulo de 45° e velocidade inicial de 100 m/s. Desprezando a resistência do ar, qual o alcance máximo? (g = 10 m/s²)', options: ['A) 500m', 'B) 1000m', 'C) 1500m', 'D) 2000m', 'E) 2500m'], answer: 'B) 1000m' },
            { exam: 'ENEM', subject: 'Física', difficulty: 'Média', theme: 'Eletrodinâmica', statement: 'Qual a potência dissipada por um resistor de 10 ohms percorrido por uma corrente de 2A?', options: ['A) 20W', 'B) 40W', 'C) 10W', 'D) 5W', 'E) 100W'], answer: 'B) 40W' },
            { exam: 'UNICAMP', subject: 'Física', difficulty: 'Difícil', theme: 'Termodinâmica', statement: 'Em uma transformação isotérmica de um gás ideal, o que permanece constante?', options: ['A) Pressão', 'B) Volume', 'C) Temperatura', 'D) Entropia', 'E) Calor'], answer: 'C) Temperatura' },
            { exam: 'VUNESP', subject: 'Física', difficulty: 'Fácil', theme: 'Ondulatória', statement: 'O som é uma onda do tipo:', options: ['A) Mecânica e Transversal', 'B) Eletromagnética e Longitudinal', 'C) Mecânica e Longitudinal', 'D) Eletromagnética e Transversal', 'E) Gravitacional'], answer: 'C) Mecânica e Longitudinal' },

            // --- QUÍMICA ---
            { exam: 'ENEM', subject: 'Química', difficulty: 'Fácil', theme: 'Estequiometria', statement: 'Qual a massa molar da água (H₂O)? (Dados: H=1u, O=16u)', options: ['A) 16 g/mol', 'B) 17 g/mol', 'C) 18 g/mol', 'D) 32 g/mol', 'E) 20 g/mol'], answer: 'C) 18 g/mol' },
            { exam: 'FUVEST', subject: 'Química', difficulty: 'Média', theme: 'Atomística', statement: 'O número atômico (Z) representa a quantidade de:', options: ['A) Nêutrons', 'B) Elétrons', 'C) Prótons', 'D) Elétrons + Prótons', 'E) Nêutrons + Prótons'], answer: 'C) Prótons' },
            { exam: 'UNICAMP', subject: 'Química', difficulty: 'Difícil', theme: 'Orgânica', statement: 'Qual função orgânica está presente no etanol?', options: ['A) Cetona', 'B) Aldeído', 'C) Álcool', 'D) Ácido Carboxílico', 'E) Éter'], answer: 'C) Álcool' },
            { exam: 'ENEM', subject: 'Química', difficulty: 'Média', theme: 'Soluções', statement: 'O que acontece com a concentração de uma solução ao adicionarmos mais solvente (diluição)?', options: ['A) Aumenta', 'B) Diminui', 'C) Permanece constante', 'D) Zera', 'E) Vira saturada'], answer: 'B) Diminui' },

            // --- BIOLOGIA ---
            { exam: 'UNICAMP', subject: 'Biologia', difficulty: 'Média', theme: 'Genética', statement: 'Qual o resultado fenotípico esperado do cruzamento Aa x aa (onde A é dominante)?', options: ['A) 100% Dominante', 'B) 100% Recessivo', 'C) 50% Dominante, 50% Recessivo', 'D) 75% Dominante, 25% Recessivo', 'E) 25% Dominante, 75% Recessivo'], answer: 'C) 50% Dominante, 50% Recessivo' },
            { exam: 'ENEM', subject: 'Biologia', difficulty: 'Fácil', theme: 'Ecologia', statement: 'Qual relação ecológica ocorre quando um organismo se beneficia e o outro é prejudicado?', options: ['A) Mutualismo', 'B) Comensalismo', 'C) Parasitismo', 'D) Protocooperação', 'E) Inquilinismo'], answer: 'C) Parasitismo' },
            { exam: 'FUVEST', subject: 'Biologia', difficulty: 'Difícil', theme: 'Citologia', statement: 'Qual organela é responsável pela respiração celular?', options: ['A) Ribossomo', 'B) Lisossomo', 'C) Mitocôndria', 'D) Complexo de Golgi', 'E) Retículo Endoplasmático'], answer: 'C) Mitocôndria' },
            { exam: 'VUNESP', subject: 'Biologia', difficulty: 'Média', theme: 'Botânica', statement: 'O processo pelo qual as plantas produzem glicose utilizando luz é:', options: ['A) Respiração', 'B) Transpiração', 'C) Fotossíntese', 'D) Fermentação', 'E) Oxidação'], answer: 'C) Fotossíntese' },

            // --- HISTÓRIA ---
            { exam: 'ENEM', subject: 'História', difficulty: 'Fácil', theme: 'Guerra Fria', statement: 'O que simbolizou o fim da Guerra Fria?', options: ['A) Queda do Muro de Berlim', 'B) Revolução Russa', 'C) Guerra da Coreia', 'D) Crise de 29', 'E) Criação da ONU'], answer: 'A) Queda do Muro de Berlim' },
            { exam: 'FUVEST', subject: 'História', difficulty: 'Média', theme: 'Brasil Colônia', statement: 'Qual era a principal atividade econômica no início da colonização do Brasil?', options: ['A) Café', 'B) Cana-de-açúcar', 'C) Ouro', 'D) Pau-Brasil', 'E) Algodão'], answer: 'D) Pau-Brasil' },
            { exam: 'UNICAMP', subject: 'História', difficulty: 'Difícil', theme: 'Idade Média', statement: 'O sistema político e econômico predominante na Idade Média europeia foi:', options: ['A) Capitalismo', 'B) Socialismo', 'C) Feudalismo', 'D) Mercantilismo', 'E) Absolutismo'], answer: 'C) Feudalismo' },
            { exam: 'ENEM', subject: 'História', difficulty: 'Média', theme: 'Era Vargas', statement: 'A CLT (Consolidação das Leis do Trabalho) foi criada no governo de:', options: ['A) JK', 'B) Getúlio Vargas', 'C) Lula', 'D) FHC', 'E) D. Pedro II'], answer: 'B) Getúlio Vargas' },

            // --- GEOGRAFIA ---
            { exam: 'ENEM', subject: 'Geografia', difficulty: 'Fácil', theme: 'Globalização', statement: 'Característica marcante da globalização:', options: ['A) Isolamento cultural', 'B) Barreiras comerciais rígidas', 'C) Fluxo instantâneo de informações', 'D) Fortalecimento do Estado-Nação', 'E) Diminuição do comércio'], answer: 'C) Fluxo instantâneo de informações' },
            { exam: 'FUVEST', subject: 'Geografia', difficulty: 'Difícil', theme: 'Climatologia', statement: 'Qual o clima predominante na região Centro-Oeste do Brasil?', options: ['A) Equatorial', 'B) Subtropical', 'C) Tropical (Continental)', 'D) Semiárido', 'E) Temperado'], answer: 'C) Tropical (Continental)' },
            { exam: 'UNICAMP', subject: 'Geografia', difficulty: 'Média', theme: 'Urbanização', statement: 'O processo de crescimento desordenado das cidades é chamado de:', options: ['A) Conurbação', 'B) Macrocefalia Urbana', 'C) Gentrificação', 'D) Planejamento Urbano', 'E) Êxodo Rural'], answer: 'B) Macrocefalia Urbana' },

            // --- PORTUGUÊS / LITERATURA ---
            { exam: 'VUNESP', subject: 'Português', difficulty: 'Média', theme: 'Gramática', statement: 'Assinale a alternativa onde ocorre crase:', options: ['A) Vou a festa.', 'B) Vou à festa.', 'C) Vou a ela.', 'D) Vou a pé.', 'E) Vou a cavalo.'], answer: 'B) Vou à festa.' },
            { exam: 'FUVEST', subject: 'Literatura', difficulty: 'Difícil', theme: 'Modernismo', statement: 'Autor de "Macunaíma":', options: ['A) Oswald de Andrade', 'B) Mário de Andrade', 'C) Manuel Bandeira', 'D) Carlos Drummond', 'E) Graciliano Ramos'], answer: 'B) Mário de Andrade' },
            { exam: 'ENEM', subject: 'Português', difficulty: 'Fácil', theme: 'Interpretação', statement: 'A função fática da linguagem foca em:', options: ['A) Na mensagem', 'B) No emissor', 'C) No canal de comunicação', 'D) No código', 'E) No receptor'], answer: 'C) No canal de comunicação' },

            // --- FILOSOFIA / SOCIOLOGIA ---
            { exam: 'ENEM', subject: 'Filosofia', difficulty: 'Média', theme: 'Política', statement: 'Para Hobbes, o homem no estado de natureza é:', options: ['A) Bom', 'B) O lobo do homem', 'C) Racional', 'D) Divino', 'E) Social'], answer: 'B) O lobo do homem' },
            { exam: 'UNICAMP', subject: 'Sociologia', difficulty: 'Média', theme: 'Cultura', statement: 'O conceito de "Indústria Cultural" foi desenvolvido por:', options: ['A) Marx e Engels', 'B) Adorno e Horkheimer', 'C) Weber e Durkheim', 'D) Foucault e Deleuze', 'E) Comte e Spencer'], answer: 'B) Adorno e Horkheimer' }
        ];
        
        await Question.insertMany(initialQuestions);
        res.json({ msg: `Sucesso! ${initialQuestions.length} questões inseridas no banco.` });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 9. CHATBOT (Gemini)
app.post('/api/chat', async (req, res) => {
    const { message } = req.body;

    if (!message) {
        return res.status(400).json({ error: 'Mensagem é obrigatória.' });
    }

    try {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ error: 'GEMINI_API_KEY não configurada.' });
        }

        // 1. Inicializa o cliente do Google
        const genAI = new GoogleGenerativeAI(apiKey);
        
        // 2. Escolhe o modelo (a biblioteca lida com a URL correta sozinha)
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

        // 3. Configura o prompt do sistema + pergunta do aluno
        const systemPrompt = "Aja como um tutor amigável e especialista chamado EstudaGênio. Explique de forma simples, passo a passo, focando em vestibulares brasileiros. Se fugir do tema, redirecione educadamente.";
        const fullPrompt = `${systemPrompt}\n\nPergunta do aluno: ${message}`;

        // 4. Gera o conteúdo
        const result = await model.generateContent(fullPrompt);
        const response = await result.response;
        const text = response.text();

        // Sucesso!
        res.json({ reply: text });

    } catch (err) {
        console.error('Erro no Chatbot:', err);
        // Se o erro for de API Key inválida ou bloqueio, vai aparecer aqui
        res.status(500).json({ error: 'Erro ao processar resposta da IA.' });
    }
});

// ROTA DO DASHBOARD (NOVA)
// Calcula todas as estatísticas para a tela "Meu Desempenho"
app.get('/api/analytics/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const history = await History.find({ userId });

        if (!history || history.length === 0) {
            return res.json({ empty: true, msg: "Nenhum dado ainda." });
        }

        // Variáveis para acumular os totais
        let totalSimulados = history.length;
        let totalQuestionsResolved = 0;
        let totalCorrect = 0;
        let totalTimeSeconds = 0;
        
        // Objeto para somar desempenho por matéria
        // Ex: { 'Matemática': { total: 10, correct: 5 }, 'Física': ... }
        let subjectStats = {};

        history.forEach(h => {
            totalQuestionsResolved += (h.totalQuestions || 0);
            totalCorrect += (h.correctCount || 0);
            totalTimeSeconds += (h.timeSpentSeconds || 0);

            // Soma matéria por matéria
            if (h.subjectsBreakdown) {
                h.subjectsBreakdown.forEach(item => {
                    if (!subjectStats[item.subject]) {
                        subjectStats[item.subject] = { total: 0, correct: 0 };
                    }
                    subjectStats[item.subject].total += item.total;
                    subjectStats[item.subject].correct += item.correct;
                });
            }
        });

        // Cálculos Finais
        const generalAccuracy = totalQuestionsResolved > 0 
            ? Math.round((totalCorrect / totalQuestionsResolved) * 100) 
            : 0;

        const avgTimePerQuestion = totalQuestionsResolved > 0 
            ? Math.round(totalTimeSeconds / totalQuestionsResolved) 
            : 0;

        // Formata o tempo (ex: 135s -> "2:15")
        const minutes = Math.floor(avgTimePerQuestion / 60);
        const seconds = avgTimePerQuestion % 60;
        const formattedTime = `${minutes}:${seconds.toString().padStart(2, '0')}`;

        // Prepara dados para o Gráfico
        const chartData = {
            labels: Object.keys(subjectStats),
            data: Object.keys(subjectStats).map(subj => {
                const s = subjectStats[subj];
                return Math.round((s.correct / s.total) * 100);
            })
        };

        // Identifica Pontos Fortes e Fracos para a IA
        let bestSubject = ''; 
        let worstSubject = '';
        let bestScore = -1;
        let worstScore = 101;

        Object.entries(subjectStats).forEach(([subj, stats]) => {
            const percentage = (stats.correct / stats.total) * 100;
            if (percentage > bestScore) { bestScore = percentage; bestSubject = subj; }
            if (percentage < worstScore) { worstScore = percentage; worstSubject = subj; }
        });

        // Retorna tudo mastigado para o Front-end
        res.json({
            cards: {
                questionsResolved: totalQuestionsResolved,
                generalAccuracy: generalAccuracy,
                simuladosCompleted: totalSimulados,
                avgTime: formattedTime
            },
            chart: chartData,
            analysisContext: {
                bestSubject,
                worstSubject,
                generalAccuracy
            }
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});