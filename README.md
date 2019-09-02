Phoenix
===


## Overview
Phoenix is a framework agnostic JS library that embraces reactive programming with RxJS, by observing asynchronous changes in Smart Contracts, and providing methods to track and subscribe to events, changes to the state of contracts and address balances, and react to these changes and events via callbacks.



## How it works?
.....



## Install
Phoenix can be used in browser, node and native script environments. You can install it through `npm` or `yarn`:
```
npm install --save phoenix
```

## Usage

### Import into Web3 dApp
```js
import Phoenix from 'phoenix';
```

### Initializing the library
In order for phoenix to be able to interact with the EVM, it requires a valid web3 provider. Websockets or IPC providers are recommended.

```js
const eventSyncer = new Phoenix(web3.currentProvider);
await eventSyncer.init();
```

`Phoenix` accepts an `options` object with additional settings that can change its behavior:
- `dbFilename` - Name of the database where the information will be stored (default 'phoenix.db')
- `callInterval` - Interval of time in milliseconds to query a contract/address to determine changes in state or balance (default: obtain data every block).

### Reacting to data changes
Phoenix provides 3 tracking functions for contract state, events and balances. These functions return RxJS Observables which you can subscribe to, and obtain and transform the observed data via operators.


#### trackProperty(contractObject, functionName [, functionArgs] [, callOptions]).
React to contract state changes. Using this method, you can track changes to the contract state, by specifying the vie function and arguments to query the contract with. 
```js
const contractObject = ...; // A web3.eth.Contract object initialized with an address and ABI.
const functionName = "..."; // string containing the name of the contract's constant/view function to track.
const functionArgs = []; // array containing the arguments of the function to track
const callOptions = {from: web3.eth.defaultAccount}; // Options used for calling. Only `from`, `gas` and `gasPrice` are accepted.
eventSyncer.trackProperty(contractObject, functionName, functionArgs, callOptions)
  .subscribe(value => console.dir)
```
This can be used as well to track public state variables, since they implicity create a view function when they're declared public. The `functionName` would be the same as the variable name, and `functionArgs` would have a value when the type is a `mapping` or `array` (since these require an index value to query them).



#### trackEvent(contractObject, eventName [, options]).
React to contract events. This method can help track changes in both ETH and ERC20 token balances for each mined block or time interval depending on the `callInterval` configured.

```js
const contractObject = ...; // A web3.eth.Contract object initialized with an address and ABI.
const eventName = "..."; // string containing the name of the event to track.
const options = { filter: { }, fromBlock: 1 }; // options used to query the events.
eventSyncer.trackEvent(contractObject, eventName, options)
  .subscribe(eventData => console.dir);
```



#### trackBalance(address [, tokenAddress]).
React to changes in the balance of addresses. This method can help track changes in both ETH and ERC20 token balances for each mined block or time interval depending on the `callInterval` configured.


```js
// Tracking ETH balance
const address = "0x0001020304050607080900010203040506070809";
eventSyncer
  .trackBalance(address)
  .subscribe((balance) => {
    console.log("ETH balance is ", balance)
  });
```

```js
// Tracking ERC20 balance
const address = "0x0001020304050607080900010203040506070809";
const tokenAddress = "0x744d70fdbe2ba4cf95131626614a1763df805b9e"; // SNT Address

eventSyncer.trackBalance(address, tokenAddress)
  .subscribe((balance) => {
    console.log("Token balance is ", balance)
  });
```



### Subscriptions
You may have noticed that each tracking function has a `.subscribe` chained to it. Subscriptions are triggered each time an observable emits a new value. These subscription receive a callback that must have a parameter which represents the value received from the observable;  and they return a subscription.

Subscriptions can be disposed by executing the method `unsubscribe()` liberating the resource held by it:

```js
const subscription = eventSyncer.trackBalance(address, tokenAddress).subscribe(value => { /* Do something */ });

// ...
// ...
// ...

subscription.unsubscribe();
```

### Cleanup
If Phoenix `eventSyncer` is not needed anymore, you need to invoke `clean()` to dispose and perform the cleanup necessary to remove the internal subscriptions and interval timers created by Phoenix during its normal execution.  Any subscription created via the tracking methods must be unsubscribed manually (in the current version).

```
eventSyncer.clean();
```



### Integrations

Phoenix does not force you to change the architecture of your dapps, making it easy to integrate in existing projects. Here are some pointers on how to integrate Phoenix with various frontend frameworks:

# TODO

#### Usage with React

```
import React from "react";
import observe from "./observe";
const EscrowObservator = observe(Escrow);
const Escrow = props => {
  const { escrow, myCustomProperty } = props;
  if(!escrow) return <p>Loading...</p>;
  return (
    <ul>
      <li>
        {escrow.buyer} {escrow.seller} - <b>EscrowID:{escrow.escrowId}</b>{" "}
        <small>{myCustomProperty}</small>
      </li>
    </ul>
  );
};
export default observe(Escrow);

 componentDidMount() {
    (async () => {
      const eventSyncer = new Phoenix(web3.currentProvider);
      await eventSyncer.init();

      this.setState({
        escrowObservable: eventSyncer.trackEvent(this.EscrowContract, "Created", { filter: { buyer: web3.eth.defaultAccount }, fromBlock: 1 })
      });

    })();
  }


  render() {
    const {escrowObservable} = this.state;

    return (
      <div>
        <EscrowObservator escrow={escrowObservable} myCustomProperty="Test" />
      </div>
    );
  }
```

#### Usage with Graphql
```
import { makeExecutableSchema } from "graphql-tools";
import gql from "graphql-tag";
import {graphql} from "reactive-graphql";

      const typeDefs = `
        type Escrow {
          buyer: String!
          seller: String!
          escrowId: Int!
        }
        type Query {
          escrows: Escrow!
        }
      `;

      const resolvers = {
        Query: {
          escrows: () => {
            return eventSyncer.trackEvent(this.EscrowContract, 'Created', { filter: { buyer: accounts[0] }, fromBlock: 1 })
          }
        }
      };

      
      
const schema = makeExecutableSchema({
  typeDefs,
  resolvers
});

const query = gql`
  query {
    escrows {
      buyer
      seller
      escrowId
    }
  }
`;

const stream = graphql(schema, query).pipe(pluck("data", "escrows"));
this.setState({
  escrow: stream
});
```



#### Usage with Redux
```
eventSyncer
    .trackEvent(EscrowContract, "Created", {
      filter: { buyer: accounts[0] },
      fromBlock: 1
    })
    .subscribe(eventData => {
      store.dispatch(created(eventData));
    });
```
##### redux observable
```
const rootEpic = action$ =>
  action$.pipe(
    ofType("INIT"),
    mergeMap(action =>
      eventSyncer
        .trackEvent(EscrowContract, "Created", {
          filter: { buyer: web3.eth.defaultAccount },
          fromBlock: 1
        })
        .pipe(map(eventData => created(eventData)))
    )
  );

const epicMiddleware = createEpicMiddleware();

const store = createStore(reducer, applyMiddleware(epicMiddleware));

epicMiddleware.run(rootEpic);
```

#### Usage with Apollo Client
```
import gql from "graphql-tag";
import { ApolloClient } from "apollo-client";
import { ApolloProvider, Query } from "react-apollo";
import { InMemoryCache } from "apollo-cache-inmemory";
import Phoenix from "phoenix";
import Web3 from "web3";
import { makeExecutableSchema } from "graphql-tools";
import PhoenixRxLink from "./phoenix-rx-link";

const MY_QUERY = gql`
  query {
    escrows {
      escrowId
    }
  }
`;

 const eventSyncer = new Phoenix(web3.currentProvider);

      await eventSyncer.init();

      const typeDefs = `
          type Escrow {
            buyer: String!
            seller: String!
            escrowId: Int!
          }
          type Query {
            escrows: Escrow!
          }
        `;

      const resolvers = {
        Query: {
          escrows: () => {
            return eventSyncer.trackEvent(this.EscrowContract, "Created", {
              filter: { buyer: accounts[0] },
              fromBlock: 1
            });
          }
        }
      };

      const schema = makeExecutableSchema({
        typeDefs,
        resolvers
      });

      const client = new ApolloClient({
        // If addTypename:true, the query will fail due to __typename
        // being added to the schema. reactive-graphql does not
        // support __typename at this moment.
        cache: new InMemoryCache({ addTypename: false }),
        link: PhoenixRxLink(schema)
      });

      this.setState({ client });

      <ApolloProvider client={this.state.client}>
        <Query query={MY_QUERY}>
          {({ loading, error, data }) => {
            if (loading) return <div>Loading...</div>;
            if (error) {
              console.error(error);
              return <div>Error :(</div>;
            }
            return (
              <p>The data returned by the query: {JSON.stringify(data)}</p>
            );
          }}
        </Query>
      </ApolloProvider>
```

## Contribution
Thank you for considering to help out with the source code! We welcome contributions from anyone on the internet, and are grateful for even the smallest of fixes!

If you'd like to contribute to Phoenix, please fork, fix, commit and send a pull request for the maintainers to review and merge into the main code base. If you wish to submit more complex changes though, please check up with the core devs first on #embark-status channel to ensure those changes are in line with the general philosophy of the project and/or get some early feedback which can make both your efforts much lighter as well as our review and merge procedures quick and simple.

## License
MIT