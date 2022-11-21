import express from "express";
import cors from 'cors';
import dotenv from 'dotenv';
import { MongoClient } from "mongodb";
import {v4 as uuidv4} from 'uuid';
import bcrypt from 'bcrypt'
import joi from "joi";

dotenv.config();

const server = express();
server.use(cors())
server.use(express.json())

const mongoClient = new MongoClient(process.env.MONGO_URI)

let db;

mongoClient.connect().then(()=>{
    db = mongoClient.db('myWallet')
})

const signUpSchema = joi.object({
    nome: joi.string().min(3).required(),
    email: joi.string().email().required(),
    senha: joi.string().min(4).required(),
    confirmeSenha: joi.ref('senha')
})

const loginSchema = joi.object({
    email: joi.string().email().required(),
    senha: joi.string().required()
})

server.post('/sign-up', async(req,res)=>{
    const {nome, email, senha} = req.body;

    const signUp = req.body;

    const validation = signUpSchema.validate(signUp, {
        abortEarly: false,
    });
    if(validation.error){
        const errors = validation.error.details.map((detail)=> detail.message);
        res.status(422).send(errors)
        return;
    }

    const hashPassword = bcrypt.hashSync(senha, 10)

    try{
        const exist = await db.collection('users').findOne({email})
        if(exist){
            res.status(422).send("email ja existe")
            return
        }

        await db.collection('users').insertOne({
            nome,
            email,
            hashSenha: hashPassword
        })
        res.status(201).send("sucesso")

    }
    catch(error){
        res.status(500).send(error.message)
        return
    }
})

server.post('/login', async(req,res)=>{

    const {email, senha} = req.body;

    const validation = loginSchema.validate(req.body, {abortEarly: false})

    
    try{
        if(validation.error){
            const errors = validation.error.details.map((detail)=>detail.message)
            res.status(401).send(errors)
            return;
        }
        const token = uuidv4();
    
        const user = await db.collection('users').findOne({email})
        const isValid = bcrypt.compareSync(senha, user.hashSenha)
        
        
        if(user && isValid){
            await db.collection('sessions').insertOne({
                token,
                userId: user._id
            })
            return res.status(200).send(token)
        }
        else{
            res.status(401).send("Email ou senha incorretos")
            return
        }
    }
    
    catch(error){
        return res.status(500).send("Verifique seus dados e tente novamente")
    }
})

server.get('/wallet', async(req, res)=>{
    const token = req.headers.authorization?.replace('Bearer ', '');

    if(!token){
        return res.sendStatus(401)
    }
    try{
        const session = await db.collection('sessions').findOne({
            token,
        })
        const user = await db.collection('users').findOne({
            _id: session.userId,
        })
        const extract = await db.collection('money').find({
            userId: session.userId,
        }).toArray()

        const cash = await db.collection('entrada_saida').findOne({
            userId: session.userId,
        })

        delete user.hashSenha
        console.log(cash)
        const dinheiro = await db.collection('dinheiro').findOne({
            userId: session.userId
        })
        if(!dinheiro){
            return res.send({
                dinheiro: true,
                user,
                cash,
                extract,
            })
        }

        // delete user.passwordHash
        // delete cash._id
        // delete cash.userId
        // delete extract._id

        res.send({
            user,
            cash, 
            extract})
        .status(200)
    }
    catch(error){
        res.status(500).send(error.message)
        return
    }

})

server.post("/wallet/positive", async(req,res)=>{
    const {valor, descricao, data, tipo} = req.body
    const token = req.headers.authorization?.replace('Bearer ', '');

    if(!token){
        return res.sendStatus(401)
    }

    const session = await db.collection('sessions').findOne({
        token
    })
    try{
        await db.collection('money').insertOne({
            valor,
            descricao,
            data,
            tipo,
            userId: session.userId,
        })

        res.sendStatus(200)

    }catch(error){
        res.status(422).send(error.message)
        return
    }
})

server.post('/home/negative', async(req,res)=>{
    const token = req.headers.authorization?.replace('Bearer', '');
    if(!token){
        return res.send(401)
    }
    const {valor, descricao, data, tipo} = req.body;
    const sesao = await db.collection('sessoes').findOne({token})
    
    console.log(sesao)
    try{

        await db.collection('dinheiro').insertOne({
            valor,
            descricao,
            data,
            tipo,
            userId: sesao.userId,
            token
        })
        res.send(200).status(200)

    }catch(error){
        res.status(422).send(error.message);
        return  
    }
})
server.put("/wallet/atualiza/:userId", async(req,res)=>{
    const {userId} = req.params;
    try{
        const money = await db.collection('entrada_saida').findOne({
            userId: ObjectId(userId)
        })
        if(!money){
            res.status(400).send("n tem");
            return
        }
        await db.collection('entrada_saida').updateOne({userId: ObjectId(userId)}, {$set: req.body })


        res.send(money)
        console.log(userId)
    }catch(error){
        res.status(500).send(error.message)
    }
})



server.listen(5000,console.log('listening on port 5000'))