import { LIT_RPC } from "@lit-protocol/constants";
import * as ethers from "ethers";
import { toHex, fromHex, createWalletClient, publicActions, http } from 'viem';
import { optimism } from "viem/chains";
import { mnemonicToAccount, toAccount } from "viem/accounts";
import { LitContracts } from "@lit-protocol/contracts-sdk";
import { LitNodeClient } from "@lit-protocol/lit-node-client";

import { LIT_ABILITY, AUTH_METHOD_SCOPE, AUTH_METHOD_TYPE, LIT_NETWORK } from '@lit-protocol/constants';
import { EthWalletProvider } from "@lit-protocol/lit-auth-client";

import {
  LitActionResource,
  LitPKPResource,
  LitAccessControlConditionResource,
  createSiweMessage,
  generateAuthSig,
  newSessionCapabilityObject
} from "@lit-protocol/auth-helpers";


const MNEMONIC = 'test test test test test test test test test test test junk'; // used to generate signer for/of the bot if you don't have
const OP_PROVIDER_URL = "https://opt-mainnet.g.alchemy.com/v2/BdptFAC-8nMGC0SjwY38mJ9A_b-A7Enj"; // Alchemy or Infura url


const account = mnemonicToAccount(MNEMONIC);
const walletClient = createWalletClient({
    account,
    chain: {
      chainId: 1234,
      name: LIT_NETWORK.DatilTest
    },
    transport: http(LIT_RPC.CHRONICLE_YELLOWSTONE),
  }).extend(publicActions);
  console.log(walletClient.account.getHdKey().privKey.toString(16));

  console.log(walletClient.account.address);
  var ethersSigner = new ethers.Wallet(
    '0x'+walletClient.account.getHdKey().privKey.toString(16),
  new ethers.providers.JsonRpcProvider(LIT_RPC.CHRONICLE_YELLOWSTONE)
);
console.log(ethersSigner.address);
 ethersSigner = new ethers.Wallet(
    '0x50aadc49d0031d8962fd3bf471302c14d4fbbc48ef98e174b9d3669b5bd2dc6c',
    
  new ethers.providers.JsonRpcProvider(LIT_RPC.CHRONICLE_YELLOWSTONE)
);
console.log(ethersSigner);


let litNodeClient;

litNodeClient = new LitNodeClient({
      litNetwork: LIT_NETWORK.DatilTest,
      debug: false,
    });
await litNodeClient.connect();
console.log(LIT_NETWORK.DatilTest)



const sessionSignatures = await litNodeClient.getSessionSigs({
  chain: "ethereum",
  expiration: new Date(Date.now() + 1000 * 60 * 10 ).toISOString(), // 10 minutes
  capabilityAuthSigs: [new newSessionCapabilityObject()], // Unnecessary on datil-dev
  resourceAbilityRequests: [
    {
      resource: new LitAccessControlConditionResource("*"),
      ability: LIT_ABILITY.AccessControlConditionDecryption,
    },
  ],
  authNeededCallback: async ({
    uri,
    expiration,
    resourceAbilityRequests,
  }) => {
    const toSign = await createSiweMessage({
      uri,
      expiration,
      resources: resourceAbilityRequests,
      walletAddress: walletClient.account.address,
      nonce: await litNodeClient.getLatestBlockhash(),
      litNodeClient,
    });

    return await generateAuthSig({
      signer: walletClient,
      toSign,
    });
  },
});
console.log(sessionSignatures);


let pkp;
let capacityTokenId;
  try {
    /*const ethersSigner = new ethers.Wallet(
      ETHEREUM_PRIVATE_KEY,
      new ethers.providers.JsonRpcProvider(LIT_RPC.CHRONICLE_YELLOWSTONE)
    );*/

    console.log("🔄 Connecting LitNodeClient to Lit network...");
    litNodeClient = new LitNodeClient({
      litNetwork: LIT_NETWORK.DatilTest,
      debug: false,
    });
    await litNodeClient.connect();
    console.log("✅ Connected LitNodeClient to Lit network");

    console.log("🔄 Connecting LitContracts client to network...");
    const litContracts = new LitContracts({
      signer: walletClient,
      network: LIT_NETWORK.DatilTest,
      debug: false,
    });
    await litContracts.connect();
    console.log("✅ Connected LitContracts client to network");

    if (!pkp) {
      console.log("🔄 Minting new PKP...");
      pkp = (await litContracts.pkpNftContractUtils.write.mint()).pkp;
      console.log(
        `✅ Minted new PKP with public key: ${pkp.publicKey} and ETH address: ${pkp.ethAddress}`
      );
    }

    if (!capacityTokenId) {
      console.log("🔄 Minting Capacity Credits NFT...");
      capacityTokenId = (
        await litContracts.mintCapacityCreditsNFT({
          requestsPerKilosecond: 10,
          daysUntilUTCMidnightExpiration: 1,
        })
      ).capacityTokenIdStr;
      console.log(`✅ Minted new Capacity Credit with ID: ${capacityTokenId}`);
    }

    console.log("🔄 Creating capacityDelegationAuthSig...");
    const { capacityDelegationAuthSig } =
      await litNodeClient.createCapacityDelegationAuthSig({
        dAppOwnerWallet: walletClient,
        capacityTokenId,
        delegateeAddresses: [pkp.ethAddress],
        uses: "1",
      });
    console.log(`✅ Created the capacityDelegationAuthSig`);

    console.log("🔄 Creating AuthMethod using the ethersSigner...");
    const authMethod = await EthWalletProvider.authenticate({
      signer: walletClient,
      litNodeClient,
    });
    console.log("✅ Finished creating the AuthMethod");

    console.log("🔄 Getting the Session Sigs for the PKP...");
    const sessionSignatures = await litNodeClient.getPkpSessionSigs({
      pkpPublicKey: pkp.publicKey,
      capabilityAuthSigs: [capacityDelegationAuthSig],
      authMethods: [authMethod],
      resourceAbilityRequests: [
        {
          resource: new LitPKPResource("*"),
          ability: LIT_ABILITY.PKPSigning,
        },
      ],
      expiration: new Date(Date.now() + 1000 * 60 * 10).toISOString(), // 10 minutes
    });
    console.log("✅ Got PKP Session Sigs");
    console.log(sessionSignatures);
  } catch (error) {
    console.error(error);
  } finally {
    litNodeClient.disconnect();
  }
