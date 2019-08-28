/*global contract, config, it, embark, web3, before, describe, beforeEach*/
const Phoenix = require("phoenix");
const TestUtils = require("../utils/testUtils");

const SellerLicense = embark.require('Embark/contracts/SellerLicense');
const ArbitrationLicense = embark.require('Embark/contracts/ArbitrationLicense');
const MetadataStore = embark.require('Embark/contracts/MetadataStore');
const Escrow = embark.require('Embark/contracts/Escrow');
const SNT = embark.require('Embark/contracts/SNT');

const BURN_ADDRESS = "0x0000000000000000000000000000000000000002";

const PUBKEY_A = "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const PUBKEY_B = "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";

let accounts;
let arbitrator;

const feePercent = 1;
const tradeAmount = 1000000;
const feeAmount = Math.round(tradeAmount * (feePercent / 100));

config({
  deployment: {
    // The order here corresponds to the order of `web3.eth.getAccounts`, so the first one is the `defaultAccount`
    accounts: [
      {
        mnemonic: "foster gesture flock merge beach plate dish view friend leave drink valley shield list enemy",
        balance: "5 ether",
        numAddresses: "10"
      }
    ]
  },
  contracts: {
    "MiniMeToken": { "deploy": false },
    "MiniMeTokenFactory": {

    },
    "SNT": {
      "instanceOf": "MiniMeToken",
      "args": [
        "$MiniMeTokenFactory",
        "0x0000000000000000000000000000000000000000",
        0,
        "TestMiniMeToken",
        18,
        "STT",
        true
      ]
    },
    License: {
      deploy: false
    },
    SellerLicense: {
      instanceOf: "License",
      args: ["$SNT", 10, BURN_ADDRESS]
    },
    ArbitrationLicense: {
      args: ["$SNT", 10, BURN_ADDRESS]
    },

    MetadataStore: {
      args: ["$SellerLicense", "$ArbitrationLicense"]
    },
    Escrow: {
      args: ["0x0000000000000000000000000000000000000000", "$SellerLicense", "$ArbitrationLicense", "$MetadataStore", BURN_ADDRESS, feePercent * 1000]
    },
    StandardToken: {
    }
  }
}, (_err, web3_accounts) => {
  accounts = web3_accounts;
  arbitrator = accounts[8];
});

contract("Escrow", function() {
  let receipt,ethOfferId, hash, signature, nonce, escrowId;
  let eventSyncer;

  this.timeout(0);

  before(async () => {
    await SNT.methods.generateTokens(accounts[0], 1000).send();
    await SNT.methods.generateTokens(accounts[1], 1000).send();

    const encodedCall = SellerLicense.methods.buy().encodeABI();
    await SNT.methods.approveAndCall(SellerLicense.options.address, 10, encodedCall).send({from: accounts[0]});

    // Register arbitrators
    await SNT.methods.generateTokens(arbitrator, 1000).send();
    const encodedCall2 = ArbitrationLicense.methods.buy().encodeABI();
    await SNT.methods.approveAndCall(ArbitrationLicense.options.address, 10, encodedCall2).send({from: arbitrator});

    await ArbitrationLicense.methods.changeAcceptAny(true).send({from: arbitrator});

    receipt  = await MetadataStore.methods.addOffer(TestUtils.zeroAddress, PUBKEY_A, PUBKEY_B, "London", "USD", "Iuri", [0], 0, 0, 1, arbitrator).send({from: accounts[0]});
    ethOfferId = receipt.events.OfferAdded.returnValues.offerId;

    eventSyncer = new Phoenix(web3.currentProvider);
    await eventSyncer.init();
  });

  describe("React to escrow changes", async () => {

    before(async () => {
      // Creating escrow
      hash = await MetadataStore.methods.getDataHash("Username", PUBKEY_A, PUBKEY_B).call({from: accounts[1]});
      signature = await web3.eth.sign(hash, accounts[1]);
      nonce = await MetadataStore.methods.user_nonce(accounts[1]).call();
      receipt = await Escrow.methods.createEscrow(ethOfferId, tradeAmount, 140, PUBKEY_A, PUBKEY_B, "L", "Username", nonce, signature).send({from: accounts[1]});
      escrowId = receipt.events.Created.returnValues.escrowId;
    });

    it("should react to status changes", done => {
      eventSyncer.trackProperty(Escrow, "transactions", [escrowId]).subscribe(value => {
        console.log("      EscrowID Status: ", value.status);
        if(value.status === "3") { // Released
          done();
        } 
      });

      (async () => {
        await Escrow.methods.fund(escrowId).send({from: accounts[0], value: tradeAmount + feeAmount});
        await Escrow.methods.pay(escrowId).send({from: accounts[1]});
        await Escrow.methods.release(escrowId).send({from: accounts[0]});
      })();
    });
  });
});
