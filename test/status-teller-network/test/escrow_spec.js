/*global contract, config, it, assert, embark, web3, before, describe, beforeEach*/
const Phoenix = require("phoenix");
const { merge } = require('rxjs');
const { map, mergeMap, scan } = require('rxjs/operators');


const TestUtils = require("../utils/testUtils");

const SellerLicense = embark.require('Embark/contracts/SellerLicense');
const ArbitrationLicense = embark.require('Embark/contracts/ArbitrationLicense');
const MetadataStore = embark.require('Embark/contracts/MetadataStore');
const Escrow = embark.require('Embark/contracts/Escrow');
const StandardToken = embark.require('Embark/contracts/StandardToken');
const SNT = embark.require('Embark/contracts/SNT');

const BURN_ADDRESS = "0x0000000000000000000000000000000000000002";

const PUBKEY_A = "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const PUBKEY_B = "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";

let accounts;
let arbitrator, arbitrator2;

const feePercent = 1;

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
  arbitrator2 = accounts[9];
});

contract("Escrow", function() {

  const {toBN} = web3.utils;

  let receipt,ethOfferId, tokenOfferId, hash, signature, nonce;
  let eventSyncer;

  this.timeout(0);

  before(async () => {
    await SNT.methods.generateTokens(accounts[0], 1000).send();
    await SNT.methods.generateTokens(accounts[1], 1000).send();

    const encodedCall = SellerLicense.methods.buy().encodeABI();
    await SNT.methods.approveAndCall(SellerLicense.options.address, 10, encodedCall).send({from: accounts[0]});
    await SNT.methods.approveAndCall(SellerLicense.options.address, 10, encodedCall).send({from: accounts[1]});

    // Register arbitrators
    await SNT.methods.generateTokens(arbitrator, 1000).send();
    await SNT.methods.generateTokens(arbitrator2, 1000).send();

    const encodedCall2 = ArbitrationLicense.methods.buy().encodeABI();
    await SNT.methods.approveAndCall(ArbitrationLicense.options.address, 10, encodedCall2).send({from: arbitrator});
    await SNT.methods.approveAndCall(ArbitrationLicense.options.address, 10, encodedCall2).send({from: arbitrator2});

    await ArbitrationLicense.methods.changeAcceptAny(true).send({from: arbitrator});
    await ArbitrationLicense.methods.changeAcceptAny(true).send({from: arbitrator2});

    receipt  = await MetadataStore.methods.addOffer(TestUtils.zeroAddress, PUBKEY_A, PUBKEY_B, "London", "USD", "Iuri", [0], 0, 0, 1, arbitrator).send({from: accounts[0]});
    ethOfferId = receipt.events.OfferAdded.returnValues.offerId;
    receipt  = await MetadataStore.methods.addOffer(StandardToken.options.address, PUBKEY_A, PUBKEY_B, "London", "USD", "Iuri", [0], 0, 0, 1, arbitrator).send({from: accounts[1]});
    tokenOfferId = receipt.events.OfferAdded.returnValues.offerId;

    eventSyncer = new Phoenix(web3.currentProvider);
    await eventSyncer.init();

   
  });

  describe("Obtaining all the escrows associated to one user", async () => {

    before(async () => {
      // Creating some escrows
      // 1. Account 1 Buyer
      hash = await MetadataStore.methods.getDataHash("Username", PUBKEY_A, PUBKEY_B).call({from: accounts[1]});
      signature = await web3.eth.sign(hash, accounts[1]);
      nonce = await MetadataStore.methods.user_nonce(accounts[1]).call();
      receipt = await Escrow.methods.createEscrow(ethOfferId, 123, 140, PUBKEY_A, PUBKEY_B, "L", "Username", nonce, signature).send({from: accounts[1]});
     
      // 2. Account 1 Seller
      hash = await MetadataStore.methods.getDataHash("Username", PUBKEY_A, PUBKEY_B).call({from: accounts[0]});
      signature = await web3.eth.sign(hash, accounts[0]);
      nonce = await MetadataStore.methods.user_nonce(accounts[0]).call();
      receipt = await Escrow.methods.createEscrow(tokenOfferId, 123, 140, PUBKEY_A, PUBKEY_B, "L", "Username", nonce, signature).send({from: accounts[0]});
     
      // 3. Account 1 Buyer
      hash = await MetadataStore.methods.getDataHash("Username", PUBKEY_A, PUBKEY_B).call({from: accounts[1]});
      signature = await web3.eth.sign(hash, accounts[1]);
      nonce = await MetadataStore.methods.user_nonce(accounts[1]).call();
      receipt = await Escrow.methods.createEscrow(ethOfferId, 123, 140, PUBKEY_A, PUBKEY_B, "L", "Username", nonce, signature).send({from: accounts[1]});
    });


    it("should retrieve selling and buying transactions", (done) => {
      // Based on escrow saga: *doLoadEscrows
      const sellerObservable = eventSyncer.trackEvent(Escrow, "Created", { filter: { seller: accounts[1] }, fromBlock: 1 }).pipe(map(x => { x.isBuyer = false; return x; }));
      const buyerObservable = eventSyncer.trackEvent(Escrow, "Created", { filter: { buyer: accounts[1] }, fromBlock: 1 }).pipe(map(x => { x.isBuyer = true; return x; }));

      const accountEscrowsObservable = merge(sellerObservable, buyerObservable).pipe(
        mergeMap(async ev => {
          const escrow = await Escrow.methods.transactions(ev.escrowId).call();
          escrow.isBuyer = ev.isBuyer;
          escrow.escrowId = ev.escrowId;
          escrow.offer = await MetadataStore.methods.offer(escrow.offerId).call();
          escrow.seller = await MetadataStore.methods.users(escrow.offer.owner).call();
          escrow.buyerInfo = await MetadataStore.methods.users(escrow.buyer).call();
          return escrow;
        }),
        scan((accum, curr) => {
          return [...accum, curr];
        }, [])
      );

      const subscription = accountEscrowsObservable.subscribe(escrows => {
        if(escrows.length === 3){
          subscription.unsubscribe();
          done();
        }
      });

    });
  });
});
