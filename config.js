require("dotenv").config()
const axios = require("axios")
const express = require("express")
const body_parser = require("body-parser")
const port = 3000
const app = express()
const { TOKEN, SERVER_URL } = process.env;
const TelegramBot = require("node-telegram-bot-api")
const { default: Stripe } = require("stripe")
app.use(body_parser.json())
const bot = new TelegramBot(TOKEN, { polling: true })
const path = require('path')
const { userInfo } = require("os")
app.use(express.static('public'));
const mysql = require("mysql");

const stripe = require('stripe')("sk_test_C8YmBFG9x8nTv1ZnC4kFd4CJ004r8nk3Rx");
const s = Stripe("sk_test_C8YmBFG9x8nTv1ZnC4kFd4CJ004r8nk3Rx");

let userID = "";
let chatID = ""
let depositAmount = 0;

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', 'http://localhost:3000');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

bot.onText(/\/start/, (msg) => {
  const chatid = msg.chat.id
  chatID = chatid;
  bot.sendMessage(chatid, "Pozdravljeni")
})

app.post(`/bot${TOKEN}`, (req, res) => {
  bot.processUpdate(req.body)
  res.sendStatus(200)
})

app.get("/payment", (req, res) => {
  res.sendFile(path.join(__dirname, 'html', 'payment.html'));
})

app.post("/create-user/:uid", (req, res) => {
  const conn = mysql.createConnection({
    user: 'admin',
    password: '12345678',
    database: 'tbot',
  })

  conn.query(`INSERT INTO users (UID) VALUES ('${req.params.uid}')`, () => {

    axios.get(`http://127.0.0.1:3000/check-user/:${req.params.uid}`).then(response => {
      if (response.data[0].COUNT == 0) {
        res.status(200).send("User successfully added!");
      } else {
        res.status(400).send("User already exists!");
      }

    })



  });

})



app.get("/check-user/:uid", (req, res) => {
  const conn = mysql.createConnection({
    user: 'admin',
    password: '12345678',
    database: 'tbot',
  })

  let userUID = String(req.params.uid).substring(1, String(req.params.uid).length)

  conn.query(`SELECT COUNT(*) AS COUNT FROM USERS WHERE UID = ${userUID};`, (err, data) => {
    if (err) {
      res.status(500).send(err.message);
    }
    else {
      res.send(data);
    }
  })

})

//





app.post('/create-payment-intent', async (req, res) => {
  const { amount } = req.body;

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount, // Amount in the smallest currency unit (e.g., cents)
      currency: 'usd',
    });

    res.send({
      clientSecret: paymentIntent.client_secret,
    });
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

bot.onText(/\/signup/, (msg) => {
  const chatid = msg.chat.id;
  axios.post(`http://127.0.0.1:3000/create-user/${chatid}`).then(() => {
    bot.sendMessage(chatid, `User successfully created! You can use this platform now!`)
  }).catch(err => { 
    if(String(err).includes("400")) {
      bot.sendMessage(chatid, `User successfully created! You can use this platform now!`)
    } else {
      bot.sendMessage(chatid, `Something went wrong by creating user!\n ${err.message}`); 
    }
  })
})

bot.onText(/\/help/, (msg) => {
  const chatid = msg.chat.id
  chatID = chatid;
  userID = msg.from.id;
  const commandsList = `/start – Initialization of the bot and basic information for the user, such as game rules, terms of use, etc.\n/help – Shows a list of all available commands and basic instructions for using the bot.\n/balance – Displays the current balance of the user's funds.\n/bet [amount] – Allows the user to bet a certain amount on a specific game.\n/roll or /spin – The main command to trigger the game. It can be used to simulate dice, roulette, etc.\n/history – Displays the history of bets and results for a specific user.\n/deposit – Allows adding funds to the account, either through an API or a simulated system.\n/withdraw – For withdrawing funds (if withdrawals are enabled).\n`;

  bot.sendMessage(chatid, commandsList);
})

bot.onText(/\/balance/, (msg) => {
  const chatid = msg.chat.id
  userID = msg.from.id;
  chatID = chatid;

  const conn = mysql.createConnection({
    user: 'admin',
    password: '12345678',
    database: 'tbot',
  })

  conn.query(`SELECT balance FROM users WHERE UID = ${Number(userID)};`, (err, data) => {
    if (err) {
      bot.sendMessage(chatid, `There is an issue by fetching data from the database!`);
      throw err;
    }
    else {
      const currentUserBalance = data[0].balance / 100;
      bot.sendMessage(chatid, `The current balance on the account is: ${currentUserBalance.toFixed(2)} $`);
    }
  })


})

bot.onText(/\/bet/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  bot.sendMessage(chatId, "Welcome to ROLL THE DICE!\nEnter the amount of cash you want to bet (in $) and the number on which you want to bet\nIn the following format: amount,number: ");

  bot.once("message", async (msg) => {
    if (String(msg.text).split(",").length == 2) {
      let betAmount = parseInt(String(msg.text).split(",")[0].trim());
      let betNumber = parseInt(String(msg.text).split(",")[1].trim());

      if (isNaN(betAmount) || isNaN(betNumber) || betNumber < 1 || betNumber > 6) {
        bot.sendMessage(chatId, "Amount and betting number must be valid integers. Betting number must be between 1 and 6.");
        return;
      }

      try {
        const conn = mysql.createConnection({
          user: 'admin',
          password: '12345678',
          database: 'tbot',
        });

        conn.connect();

        conn.query(`SELECT balance FROM users WHERE UID = ${userId}`, [userId], (err, results) => {
          if (err) {
            bot.sendMessage(chatId, `There was an issue fetching data from the database.`);
            console.error(err);
            return;
          }

          if (results.length === 0) {
            bot.sendMessage(chatId, `User not found.`);
            return;
          }

          let currentUserBalance = results[0].balance / 100;

          if (currentUserBalance < betAmount) {
            bot.sendMessage(chatId, `Insufficient balance!`);
            return;
          }

          bot.sendMessage(chatId, "Rolling the dice... Please wait");
          setTimeout(() => {
            let luckyNumber = Math.floor(Math.random() * 6) + 1;
            bot.sendMessage(chatId, `The lucky number is: ${luckyNumber}`);

            if (betNumber === luckyNumber) {
              let winnings = betAmount * 6;
              bot.sendMessage(chatId, `Congratulations! You won ${winnings} units.`);
              // Update the user's balance in the database
              let newBalance = (currentUserBalance + winnings) * 100;
              conn.query(`UPDATE users SET balance = ? WHERE UID = ${userId}`, [newBalance, userId], (err) => {
                if (err) {
                  console.error(err);
                }
              });
            } else {
              bot.sendMessage(chatId, `Better luck next time!`);
              // Deduct the bet amount from the user's balance
              let newBalance = (currentUserBalance - betAmount) * 100;
              conn.query(`UPDATE users SET balance = ? WHERE UID = ${userId}`, [newBalance, userId], (err) => {
                if (err) {
                  console.error(err);
                }
              });
            }

            conn.end();
          }, 5000);
        });
      } catch (error) {
        console.error(error);
        bot.sendMessage(chatId, `An error occurred.`);
      }
    } else {
      bot.sendMessage(chatId, "Invalid format. Please enter the amount and number in the format: amount,number.");
    }
  });
});

bot.onText(/\/roll/, (msg) => {
  const chatid = msg.chat.id
  userID = msg.from.id;
  chatID = chatid;
  bot.sendMessage(chatid, "Kako vam lahko pomagan")
})

bot.onText(/\/spin/, (msg) => {
  const chatid = msg.chat.id
  userID = msg.from.id;
  chatID = chatid;
  bot.sendMessage(chatid, "Kako vam lahko pomagan")
})

bot.onText(/\/history/, (msg) => { // trnasactions deposit/withdraw history
  const chatid = msg.chat.id
  userID = msg.from.id;
  chatID = chatid;
  bot.sendMessage(chatid, "This is the history of your transactions: ")
})


app.post("/add-balance", (req, res) => {

  const conn = mysql.createConnection({
    user: 'admin',
    password: '12345678',
    database: 'tbot',
  })

  console.log("UID " + userID)
  console.log("deposit amount " + depositAmount)
  if (req.body.deposit == true) {
    conn.query(`UPDATE users SET balance = balance + ${depositAmount} WHERE UID = ${Number(userID)};`, (err, data) => {
      if (err) res.status(500).send("The transaction failed!")
      else {
        conn.query(`SELECT balance FROM users WHERE UID = ${Number(userID)};`, (err, data) => {
          if (err) throw err;
          else {
            const currentUserBalance = data[0].balance / 100;
            bot.sendMessage(chatID, `Deposited funds were added successfully. The current balance on the account is: ${currentUserBalance} $`);
          }
        })

        res.status(200).send("Funds will be credited to your account!")
      }
    })


  } else {
    res.status(402).send("The transaction failed!")
  }
})

app.post('/create-payout/:userid', async (req, res) => {
  const { userId, amount, currency, account_number, routing_number, account_holder_name, account_holder_type } = req.body;
  let userBalance = 0;

  const conn = mysql.createConnection({
    user: 'admin',
    password: '12345678',
    database: 'tbot'
  })

  console.log(req.params.userid)
  conn.query(`SELECT balance FROM users WHERE UID = ${req.params.userid}`, (err, data) => {
    if (err) throw err;
    else {
      userBalance = data;
      console.log("Current balance: " + data[0].balance)

      // Check if user exists and has sufficient balance
      if (!userBalance || userBalance < amount) {
        return res.status(401).send({ error: 'Insufficient funds' });
      }
    }
  })

  // Step 1: Create a new customer
  stripe.customers.create({ name: account_holder_name }).then(customer => {
    // Step 2: Add a bank account to the customer using a test token
    return stripe.customers.createSource(customer.id, { source: 'btok_us_verified' }).then(bankAccount => {
      // Step 3: Create a payout to the bank account
      return stripe.payouts.create({
        amount: amount, // Amount in smallest currency unit (e.g., cents)
        currency: currency,
        method: 'standard',
        destination: bankAccount.id
      }).then(payout => {
        // Deduct the amount from the user's balance
        userBalance -= (amount);

        res.json({ status: payout.status, payoutId: payout.id });
      }).catch(err => {
        console.error('Error creating payout:', err);
        res.status(500).send('Error creating payout');
      });
    }).catch(err => {
      console.error('Error adding bank account:', err);
      res.status(500).send('Error adding bank account');
    });
  }).catch(err => {
    console.error('Error creating customer:', err);
    res.status(500).send('Error creating customer');
  });

  /*
    try {
      // Step 1: Create a new customer
      const customer = await stripe.customers.create({
        name: account_holder_name,
      });
  
      // Step 2: Add a bank account to the customer
      const bankAccount = await stripe.customers.createSource(customer.id, {
        source: {
          object: 'bank_account',
          country: 'US',
          currency: currency,
          account_holder_name: account_holder_name,
          account_holder_type: account_holder_type,
          routing_number: routing_number,
          account_number: account_number,
          account_holder_type: account_holder_type
        },
      });
  
      // Step 3: Create a payout to the bank account
      const payout = await stripe.payouts.create({
        amount: amount, // Amount in smallest currency unit (e.g., cents)
        currency: currency,
        method: 'standard',
        destination: bankAccount.id,
      });
  
      // Deduct the amount from the user's balance
      userBalances[userId] -= amount;
  
      res.json({ status: payout.status, payoutId: payout.id });
    } catch (error) {
      console.error(error);
      res.status(500).send('Error creating payout');
    }*/
});

bot.onText(/\/deposit/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  userID = userId;
  chatID = chatId;

  bot.sendMessage(chatId, 'Please enter the amount you would like to deposit:');

  bot.once('message', async (msg) => {
    const amount = parseInt(msg.text) * 100; // Convert to smallest currency unit (e.g., cents)
    depositAmount = amount;
    try {
      const response = await axios.post('http://localhost:3000/create-payment-intent', {
        amount: amount,
        currency: 'usd'
      });

      const clientSecret = response.data.clientSecret;
      //bot.sendMessage(chatId, `Deposit initiated. Use this client secret to complete the payment: ${clientSecret}`);
      const paymentUrl = `http://localhost:3000/payment?client_secret=${clientSecret}`;
      bot.sendMessage(chatId, `Please complete your payment by visiting the following link: ${paymentUrl}`);
    } catch (error) {
      console.error('Error:', error);
      bot.sendMessage(chatId, 'An error occurred while initiating the deposit.');
    }
  });
});



bot.onText(/\/withdraw/, (msg) => {

  const chatId = msg.chat.id;
  const userId = msg.from.id;

  console.log('Withdraw command received from chat:', chatId);

  // Step 1: Ask for the amount to be withdrawn
  bot.sendMessage(chatId, 'Please enter the amount you would like to withdraw (in cents):');

  bot.once('message', (amountMsg) => {
    const amount = parseInt(amountMsg.text);

    if (isNaN(amount)) {
      bot.sendMessage(chatId, 'Invalid amount entered. Please enter a number.');
      return;
    }

    console.log('Amount entered:', amount);

    // Step 2: Ask for the bank account details
    bot.sendMessage(chatId, 'Please enter your bank account details in the format: "account_number,routing_number,account_holder_name,account_holder_type"');

    bot.once('message', async (detailsMsg) => {
      const details = detailsMsg.text.split(',');
      if (details.length !== 4) {
        bot.sendMessage(chatId, 'Invalid format. Please enter the details in the correct format.');
        return;
      }

      const [account_number, routing_number, account_holder_name, account_holder_type] = details.map(detail => detail.trim());

      if (!account_number || !routing_number || !account_holder_name || !account_holder_type) {
        bot.sendMessage(chatId, 'Incomplete details. Please provide all the required information.');
        return;
      }

      const data = {
        userId,
        amount,
        currency: 'usd',
        account_number,
        routing_number,
        account_holder_name,
        account_holder_type
      };

      try {
        const response = await axios.post(`http://localhost:3000/create-payout/${chatId}`, data);
        const { status, payoutId } = response.data;

        if (status === 'paid') {
          bot.sendMessage(chatId, `Withdrawal successful! Payout ID: ${payoutId}`);
        } else {
          bot.sendMessage(chatId, `Withdrawal failed. Payout status: ${status}`);
        }
      } catch (error) {
        console.error('Error:', error);
        bot.sendMessage(chatId, 'An error occurred while processing the withdrawal.');
      }
    });
  });
});

let chosenGameIndex = 0;
let gameChosen = false;




app.get("/", (req, res) => { res.send("Zdravo") })

app.listen(port, () => { console.log(`Listenig to: http://127.0.0.1:${port}`) })