import fs from 'fs';
import path from 'path';

import CryptoJS from 'crypto-js';
import inquirer from 'inquirer';
import TronWeb from 'tronweb';

const tronWeb = new TronWeb({
    fullHost: 'https://api.trongrid.io',
    solidityNode: 'https://api.trongrid.io',
});

const ACCOUNTS_FILE_PATH = path.join(process.cwd(), 'config', 'accounts.json');
const TetherAddress = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'

/**
 * Decrypts data using AES encryption.
 * @param {string} password - The decryption password.
 * @param {string} data - The data to decrypt.
 * @returns {string} - The decrypted data.
 */
const decryptWithAES = (password, data) => {
    return CryptoJS.AES.decrypt(data, password).toString(CryptoJS.enc.Utf8);
};

/**
 * Encrypts data using AES encryption.
 * @param {string} password - The encryption password.
 * @param {string} data - The data to encrypt.
 * @returns {string} - The encrypted data.
 */
const encryptWithAES = (password, data) => {
    return CryptoJS.AES.encrypt(data, password).toString();
};

/**
 * 
 * @returns {Promise<boolean>} - Whether the user wants to continue.
 */
const pressToContinue = async () => {
    console.log();
    await inquirer.prompt([
        {
            type: 'input',
            name: 'continueOperation',
            message: 'Press Enter to continue...',
        },
    ]);
    console.clear();
}

/**
 * Prompts the user to enter a password.
 * @returns {Promise<string>} - The entered password.
 */
const askForPassword = async () => {
    const { password, passwordConfirmation } = await inquirer.prompt([
        {
            type: 'password',
            name: 'password',
            message: 'Enter a password:',
        },
        {
            type: 'password',
            name: 'passwordConfirmation',
            message: 'Confirm your password:',
        },
    ]);

    return password !== passwordConfirmation
        ? askForPassword()
        : password;
};

/**
 * Loads accounts data from file.
 * @returns {object[]} - Array of account objects.
 */
const loadAccounts = () => {
    try {
        const data = fs.readFileSync(ACCOUNTS_FILE_PATH, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return [];
    }
};

/**
 * Saves accounts data to file.
 * @param {object[]} accounts - Array of account objects to save.
 */
const saveAccounts = (accounts) => {
    fs.writeFileSync(ACCOUNTS_FILE_PATH, JSON.stringify(accounts, null, 4), 'utf8');
};

/**
 * Prompts the user to create a new wallet.
 * @returns {Promise<object>} - New wallet object.
 */
const createWallet = async () => {
    const name = await askForName();
    const password = await askForPassword();

    const account = await tronWeb.createAccount();
    const encryptedPrivateKey = encryptWithAES(
        password, account.privateKey
    );

    const newWallet = {
        address: account.address,
        privateKey: encryptedPrivateKey,
        publicKey: account.publicKey,
        name,
    };

    const accounts = loadAccounts();
    accounts.push(newWallet);

    saveAccounts(accounts);

    console.log('Wallet created successfully.');
    return newWallet;
};

/**
 * Prompts the user to select a wallet.
 * @returns {Promise<object | undefined>} - Selected wallet object.
 */
const selectWallet = async () => {
    const accounts = loadAccounts();

    if (accounts.length === 0) {
        console.log('No accounts available.');
        return;
    }

    const choices = accounts.map((wallet) => ({
        name: `${wallet.name} @ ${wallet.address.base58}`,
        value: wallet,
    }));

    const { selectedWallet } = await inquirer.prompt([
        {
            type: 'list',
            name: 'selectedWallet',
            message: 'Select a wallet:',
            choices,
        },
    ]);

    return selectedWallet;
};

/**
 * Prompts the user to check or send balance from a wallet.
 */
const manageWallet = async () => {
    const wallet = await selectWallet();

    if (!wallet) {
        console.log('No wallet selected.');
        await pressToContinue();

        return;
    }

    while (true) {
        console.clear();
        const { action } = await inquirer.prompt([
            {
                type: 'list',
                name: 'action',
                message: 'What do you want to do?',
                choices: [
                    'Check balance',
                    'Send token',
                    'Cancel'
                ],
            },
        ]);

        console.clear();
        if (action === 'Check balance') {
            await checkBalance(wallet);
        }
        else if (action === 'Send token') {
            await sendToken(wallet);
        }
        else {
            break;
        }
    }
};

/**
 * Prompts the user to enter a wallet name.
 * @returns {Promise<string>} - Entered wallet name.
 */
const askForName = async () => {
    const { name } = await inquirer.prompt([
        {
            type: 'input',
            name: 'name',
            message: 'Enter a name for this wallet:',
            validate: (value) => {
                if (value.trim().length === 0) {
                    return 'Please enter a name.';
                }
                return true;
            },
        },
    ]);
    return name.trim();
};

const getUSDTBalance = async (wallet) => {
    tronWeb.setAddress(TetherAddress);

    const contract = await tronWeb.contract().at(TetherAddress);

    const result = await contract.balanceOf(wallet.address.base58).call();
    const number = tronWeb.toBigNumber(result._hex).toNumber();

    return tronWeb.fromSun(number);
}

/**
 * Retrieves the TRX balance of a wallet.
 * @param {object} wallet - Wallet object.
 * @returns {Promise<number>} - TRX balance.
 */
const getTRXBalance = async (wallet) => {
    const balance = await tronWeb.trx.getBalance(wallet.address.base58);
    return tronWeb.fromSun(balance);
};

/**
 * Sends TRX or token to a recipient.
 * @param {object} wallet - Wallet object.
 */
const sendToken = async (wallet) => {
    const { type } = await inquirer.prompt([
        {
            type: 'list',
            name: 'type',
            message: 'Select token to send:',
            choices: [
                'USDT',
                'TRX'
            ],
        },
    ])

    const balance = type === 'USDT'
        ? await getUSDTBalance(wallet)
        : await getTRXBalance(wallet);

    const { recipient, amount } = await inquirer.prompt([
        {
            type: 'input',
            name: 'recipient',
            message: 'Enter recipient address:',
        },
        {
            type: 'number',
            name: 'amount',
            message: 'Enter amount to send:',
            validate: (value) => {
                if (value > balance) {
                    return `Amount must be less than or equal to ${balance}.`;
                }
                if (value <= 0) {
                    return 'Amount must be greater than 0.';
                }
                return true;
            }
        },
    ]);

    const privateKey = decryptWithAES(
        await askForPassword(), wallet.privateKey
    );

    if (type === 'USDT') {
        tronWeb.setAddress(TetherAddress)
        tronWeb.setPrivateKey(privateKey)

        const contract = await tronWeb.contract().at(TetherAddress)
        const result = await contract.transfer(
            recipient, amount * 1000000
        ).send()

        console.log('Transaction sent:', result)
    } else {
        const transaction = await tronWeb.trx.sendTransaction(
            recipient, tronWeb.toSun(amount)
        );

        console.log('Transaction sent:', transaction.txid);
    }

    await pressToContinue();
};

/**
 * Checks and displays the balance of a wallet.
 * @param {object} wallet - Wallet object.
 */
const checkBalance = async (wallet) => {
    const usdtBalance = await getUSDTBalance(wallet);
    console.log(`USDT Balance: ${usdtBalance}`);

    const trxBalance = await getTRXBalance(wallet);
    console.log(`TRX Balance: ${trxBalance}`);

    await pressToContinue();
};

/**
 * Main function to manage wallet operations.
 */
const main = async () => {
    while (true) {
        console.clear()
        const { choice } = await inquirer.prompt([
            {
                type: 'list',
                name: 'choice',
                message: 'What do you want to do?',
                choices: [
                    'Create new wallet',
                    'Manage existing wallet',
                    'Exit'
                ],
            },
        ]);

        console.clear()
        if (choice === 'Create new wallet') {
            await createWallet();
        }
        else if (choice === 'Manage existing wallet') {
            await manageWallet();
        }
        else {
            break;
        }
    }

    console.log('Exiting wallet operations.');
};

main();
