import React, { useState, useEffect } from "react";
import styled from "styled-components";
import { ConnectButton, WalletKitProvider } from "@mysten/wallet-kit";

import {  useWalletKit } from "@mysten/wallet-kit";
import { formatAddress } from "@mysten/sui.js";

import { ZqField, Scalar } from "ffjavascript";
import { shake128 } from 'js-sha3';

import { string_to_curve } from "../../boneh-encode/hash_to_curve.mjs";

import * as wasm from "../../ark-serializer/pkg/ark_serializer_bg.wasm";
import { __wbg_set_wasm } from "../../ark-serializer/pkg/ark_serializer_bg.js";
import { vkey_serialize, vkey_prepared_serialize, proof_serialize, public_input_serialize } from "../../ark-serializer/pkg/ark_serializer_bg.js";

import { localnetConnection, testnetConnection, TransactionBlock, Ed25519Keypair, JsonRpcProvider, RawSigner, mnemonicToSeed, Ed25519PublicKey, hasPublicTransfer } from '@mysten/sui.js';
import { BCS, getSuiMoveConfig } from "@mysten/bcs";

import Modal from 'react-modal';

import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { ToastContainer } from 'react-toastify';

//The following four functions are just playing with encoding between field Big integers 
//and their representations inside of the smart contract

function arr_to_bigint(arr) {
  let result = BigInt(0);
  for (let i = arr.length - 1; i >= 0; i--) {
    result = result * BigInt(256) + BigInt(arr[i]);
  }
  return result;
}

function arr_from_hex(hexString) {
  const _hexString = hexString.replace("0x", "");
  const utf8Encoder = new TextEncoder();
  const utf8Decoder = new TextDecoder();
  const bytes = utf8Encoder.encode(_hexString);
  const hex = new Uint8Array(bytes.length / 2);

  for (let i = 0; i < bytes.length; i += 2) {
    const byte1 = bytes[i] - 48 > 9 ? bytes[i] - 87 : bytes[i] - 48;
    const byte2 = bytes[i + 1] - 48 > 9 ? bytes[i + 1] - 87 : bytes[i + 1] - 48;
    hex[i / 2] = byte1 * 16 + byte2;
  }

  return hex;
}

const utf8_hex_to_int = (by) => {
  console.log({ by })
  const hex = new TextDecoder().decode(new Uint8Array(by));
  const arr = new Uint8Array(hex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
  return arr_to_bigint(arr);
}

function addr_to_bigint(addr) {
  const interm = arr_from_hex(addr);
  //Zeroize the last - most significant byte of address to prevent the number being bigger than base Field modulo
  interm[31] = 0;
  return arr_to_bigint(interm);
}


//Generate a random one-time key to multiply by professors result
const r = Scalar.fromString("2736030358979909402780800718157159386076813972158567259200215660948447373041");
const F = new ZqField(r);
const student_key = F.random().toString();

//Get .move package on Sui testnet address from .env
const verifier_pkg = process.env.packageId;
const quest_id = process.env.questId;
console.log({ verifier_pkg, quest_id });

//Define the styled components for the demo website
const Container = styled.div`
  display: flex;
  flex-direction: column;
  /* align-items: center; */
  justify-content: flex-start;
  min-height: 90vh;
  max-width: 500px;
  //background-image: url("/forest.jpg");
  //background-size: cover;
`;

const ImageLogo = styled.img`
  width: 262px;
  // height: 200px;
  //margin-bottom: 20px;
  align-self: flex-start;
  justify-self: flex-start;
  // animation: spin 2s linear infinite;
  // filter: drop-shadow(0px 5px 5px rgba(0, 0, 0, 0.5));

  // @keyframes spin {
  //   100% {
  //     transform: rotate(360deg);
  //   }
  // }
`;

const Image = styled.img`
  width: 70%;
  //clip-path: inset(100px 90px 90px 0 round 50px);
  // height: 200px;
  //margin-top: -15vh;
  align-self: center;
  justify-self: center;
  // animation: spin 2s linear infinite;
  // filter: drop-shadow(0px 5px 5px rgba(0, 0, 0, 0.5));

  // @keyframes spin {
  //   100% {
  //     transform: rotate(360deg);
  //   }
  // }
`;

const ImageStop = styled.img`
  width: 200px;
  height: 200px;
  margin-bottom: 20px;
  align-self: center;
  filter: drop-shadow(0px 5px 5px rgba(0, 0, 0, 0.5));
`;

const Question = styled.h2`
  font-family: "Georgia", serif;
  font-size: 24px;
  /* margin-top: -50%; */
  margin-bottom: 20px;
  margin-top: 20px;
  color: #000;
  text-align: center;
  /* text-shadow: 0px 0px 10px rgba(0, 0, 0, 0.5); */
`;

const Hint = styled.p`
  font-family: "Georgia", serif;
  font-size: 19px;
  margin-bottom: 20px;
  color: #000;
  text-align: center;
  /* text-shadow: 0px 0px 10px rgba(0, 0, 0, 0.5); */
`;

const Input = styled.input`
  width: 100%;
  height: 40px;
  padding: 10px;
  margin-bottom: 20px;
  border-radius: 5px;
  border: none;
  font-size: 16px;
  text-align: center;
  box-shadow: 0px 5px 5px rgba(0, 0, 0, 0.5);
`;

const Button = styled.button`
  background-color: #00c853;
  color: #fff;
  font-size: 16px;
  font-weight: bold;
  padding: 10px 20px;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  box-shadow: 0px 5px 5px rgba(0, 0, 0, 0.5);
  transition: all 0.2s ease-in-out;

  &:hover {
    background-color: #007e3a;
    box-shadow: 0px 7px 7px rgba(0, 0, 0, 0.5);
    transform: translateY(-2px);
  }

  &:active {
    background-color: #005d1e;
    box-shadow: 0px 2px 2px rgba(0, 0, 0, 0.5);
    transform: translateY(2px);
  }
`;

const MintButton = styled(Button)`
  background-color: #ff6d00;
  margin-top: 20px;
`;

const WalletConnectButton = styled(Button)`
  background-color: #2962ff;
`;

const Form = styled.form`
  margin-top: 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  max-width: 500px;
  width: 90%;
`;

const Column = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  justify-self: center;
  width: 100%;
  margin-bottom: 20px;

  // @media (max-width: 768px) {
  //   flex-direction: row;
  //   justify-content: space-between;
  // }
`;

const Flex = styled.div`
  margin-bottom: 50px;
  display: flex;
  justify-content: space-between;
  flex-direction: row;
  //align-items: flex-end;
  //justify-content: flex-end;
  justify-self: flex-start;
  align-self: flex-start; 
  width: 100%;
  margin-top: 20px;

  // @media (max-width: 768px) {
  //   flex-direction: row;
  //   justify-content: space-between;
  // }
`;

const InputColumn = styled(Column)`

  // @media (max-width: 768px) {
  //   width: 70%;
  //   margin-right: 20px;
  // }
`;

const ImageColumn = styled(Column)`
     margin-top: 20px;
  // @media (min-width: 768px) {
  //   width: 30%;
  //   margin-left: 20px;
  // }
`;

//A component that is a wallet connect button
function ConnectToWallet() {
  const { currentAccount } = useWalletKit();
  return (
    <ConnectButton
      connectText={"Connect Wallet"}
      connectedText={currentAccount && `Connected: ${formatAddress(currentAccount.address)}`}
      style={{justifySelf: "flex-end"}}
    />
  );
}

//A function where the main work happens
//Here we prove the arithmetic circuits with snarkjs, serialize the data with ark-works
//And send transaction to Sui network smart contract
async function answer_quest(snarkjs, addr, quest_id, student_answer) {

  //Encode the answer to a point on elliptic curve using try-and-increment method
  const { xx: student_H_x, yy: student_H_y } = string_to_curve(student_answer);

  const provider = new JsonRpcProvider(testnetConnection);
  const addr_for_proof = addr_to_bigint(addr).toString();
  console.log(addr_for_proof);

  //BEGIN: Generate commit proof for student answer point on elliptic curve//
  const { proof: proof_commit, publicSignals: publicSignals_commit } = await snarkjs.groth16.fullProve({ address: addr_for_proof, a: student_key, P_x: student_H_x, P_y: student_H_y }, "compiled_circuits/commit_main.wasm", "compiled_circuits/commit_main.groth16.zkey");
  console.log({ student_H_x, student_H_y, proof: JSON.stringify(proof_commit), publicSignals_commit })

  const proof_commit_serialized = proof_serialize(JSON.stringify(proof_commit));
  console.log({ proof_commit_serialized })

  //Now serialzie with my ark-serialize the public inputs    
  const signals_commit = publicSignals_commit.map((input) => public_input_serialize(input))
  console.log({ signals_commit })

  const [student_a_hash_int, student_aH_x_int, student_aH_y_int,] = publicSignals_commit;
  const [student_a_hash, student_aH_x, student_aH_y,] = signals_commit
  console.log(student_a_hash, student_aH_x, student_aH_y);
  //END: Generate commit proof for student answer point on elliptic curve//

  //Here we must retrieve from Sui api professor_kP_x and professor_kP_y written in this shared Quest object
  //And convert this vector<u8> array the right way into a number for the proving system
  //make it professor_kP_x_int, professor_kP_y_int 
  const { data: { content: quest_object } } = await provider.getObject({
    id: quest_id,
    // fetch the object content field
    options: { showContent: true },
  });
  console.log({ quest_object })
  const { professor_kP_x, professor_kP_y } = quest_object.fields;

  //Convert bytes to utf-8 string
  //Then decode this hex encoded string to bytes
  //Take those bytes and convert to number
  //Take into account that the first byte is the least significant byte
  const professor_kP_x_int = utf8_hex_to_int(professor_kP_x).toString();
  const professor_kP_y_int = utf8_hex_to_int(professor_kP_y).toString();

  console.log({ quest_object, professor_kP_x, professor_kP_y, professor_kP_x_int, professor_kP_y_int });

  //BEGIN: Generate unlock proof of student multiplied professors point with her same key 
  const { proof: proof_unlock, publicSignals: publicSignals_unlock } = await snarkjs.groth16.fullProve({ address: addr_for_proof, k: student_key, hash_k: student_a_hash_int, aH_x: professor_kP_x_int, aH_y: professor_kP_y_int }, "compiled_circuits/unlock_main.wasm", "compiled_circuits/unlock_main.groth16.zkey");
  console.log({ proof: JSON.stringify(proof_unlock), publicSignals_unlock })

  const proof_unlock_serialized = proof_serialize(JSON.stringify(proof_unlock));
  console.log({ proof_unlock_serialized })

  //Now serialzie with my ark-serialize the public inputs    
  const signals_unlock = publicSignals_unlock.map((input) => public_input_serialize(input))
  console.log({ signals_unlock })

  const [akP_x, akP_y, , ,] = signals_unlock
  console.log({ akP_x, akP_y });
  //END: Generate unlock proof of student multiplied professors point with her same key//

  //Send the transaction to the verifier implemented in ../sui-verifier/sources/dev_verifier.moive on-chain smart contract
  const tx = new TransactionBlock();

  //In 1 SUI 1_000_000_000 MIST
  //Just 1000 MIST - a small amount for test; Though in production it reqires 0.1 SUI to deincentivize bruteforcing
  //You might set any ammount needed in dev_verifier.move and tweak it here accordingly
  const [coin] = tx.splitCoins(tx.gas, [tx.pure(1000)]);

  //Smart contract method signature of student_answer_question(shared_quest: &mut Quest, c: coin::Coin<SUI>, proof_commit: vector<u8>,
  //student_a_hash: vector<u8>, student_aH_x: vector<u8>, student_aH_y: vector<u8>, 
  //proof_unlock: vector<u8>, akP_x: vector<u8>, akP_y: vector<u8>, ctx: &TxContext)

  //Here we assemble a transaction in agreement with this method signature
  tx.moveCall({
    target: verifier_pkg + '::verifier::student_answer_question',
    typeArguments: [],
    arguments: [
      tx.pure(quest_id),
      coin,

      tx.pure(proof_commit_serialized),
      tx.pure(student_a_hash),
      tx.pure(student_aH_x),
      tx.pure(student_aH_y),

      tx.pure(proof_unlock_serialized),
      tx.pure(akP_x),
      tx.pure(akP_y),
      tx.pure("0x0000000000000000000000000000000000000000000000000000000000000006")
    ],
    gasBudget: 10000
  }
  )
  console.log({ tx })
  return tx;
}

const connectButton = styled(ConnectButton);

const provider = new JsonRpcProvider(testnetConnection);

//Use some timer hook to do something every 10 seconds
//Every 10 seconds try to fetch new account objects
//If account objects list changed
//See the new object if it is ProfessorNFT then say yes, change picture to its picture
//Add many toasts with congratulations
//And explanations


const Main = () => {

  //Initialize the state of react application with data we may want to track
  //And which influences the outcome of program execution
  const [answer, setAnswer] = useState("");
  const [image, setImage] = useState("/question-mark.png");
  const [spinning, setSpinning] = useState(true);
  const [showPopup, setShowPopup] = useState(true);
  const [objects, setObjects] = useState([]);

  //Load the wasm for my ark-serialzier module
  //It works fine without it in dev mode i.e (npm run dev)
  //But in production mode like on netlify vite "forgets" to do it, so we manually should init the module here
  useEffect(() => {
    __wbg_set_wasm(wasm);
    console.log("wasm set");
  }, [])

  //Use wallet hook given by MystenLabs to propose transactions and see current connected account address
  const { currentAccount, signAndExecuteTransactionBlock } = useWalletKit();

  //Here is every 2 seconds checker for changes in the list of objects owned by a person
  //If it changes and she suddenly gets an NFT then we congratulate
  //If it changes and the player gets wrong answer record the we say sorry and encourage trying more
  useEffect(() => {
    const intervalId = setInterval(async () => {
      //Fetch owned object
      //setSpinning(false);
      // toast.success('Yes you were right! Look for a prize in your wallet!!!');
      //setImage("/golden.png")
      const fetchedObjects = await provider.getOwnedObjects({
        owner: currentAccount.address,
        options: { showContent: true },
      });
      fetchedObjects.data.map(obj => { delete obj.data.digest; delete obj.data.version })

      console.log({ fetchedObjects })
      if (objects.length == 0) { setObjects(fetchedObjects); return }

      if (JSON.stringify(objects) !== JSON.stringify(fetchedObjects) && objects?.data?.length > 0 && fetchedObjects?.data?.length > 0) {
        setObjects(fetchedObjects);
        console.log("changed objects")

        //We need a system with sets because by default versions and digests of objects might change
        //Like when sending coins to interact with this contract
        //It would give us a false start without proper tracking
        const set2 = new Set(objects.data.map(obj => obj.data.objectId));
        const set1 = new Set(fetchedObjects.data.map(obj => obj.data.objectId));

        // Find the difference between set1 and set2
        const difference = new Set([...set1].filter(x => !set2.has(x)));
        console.log({ set1, set2, difference })
        // Convert the resulting set back to an array
        const differenceArray = Array.from(difference);
        const diffObjArray = fetchedObjects.data.filter(obj => differenceArray.includes(obj.data.objectId));
        console.log({ differenceArray, diffObjArray });

        //This is event of right answer when a person finally got rewarded with an NFT
        if (diffObjArray.some(obj => obj?.data?.content?.type === verifier_pkg + "::verifier::RewardNFT")) {
          setSpinning(false);
          toast.success('Yes you were right! Look for a prize in your wallet!!!');
          setImage("/golden.png")
        }

        //This is event of wrong answer when a person just got a WrongAnswerNFT record
        if (diffObjArray.some(obj => obj?.data?.content?.type === verifier_pkg + "::verifier::WrongAnswerNFT")) {
          toast.error('Sorry, the zk score came. It was a wrong answer. Please try more!!!');
        }
      }

    }, 2000);

    return () => clearInterval(intervalId);
  }, [objects, currentAccount]);


  const handleClosePopup = () => {
    setShowPopup(false);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    toast.info('Please approve the transaction to submit your answer :)');

    //Use the function with zk proofs to generate the proving transaction
    const txBlock = await answer_quest(window.snarkjs, currentAccount.address, quest_id, answer);
    await signAndExecuteTransactionBlock({ transactionBlock: txBlock });

    //Warn that scoring by oracle run on my computer
    //Will take some time for transaction to pass
    //Hopefully the internet will not break!
    toast.warning('Please wait 10-20 seconds to get zkScored!');

    //Reset the answer field
    setAnswer("");
  };

  return (
    <>
    
    <Container>
    <Flex><ImageLogo src="/logo_full.png" alt="Logo with text saying PROMISE" /> <ConnectToWallet></ConnectToWallet></Flex>
      {/* <Modal isOpen={showPopup} onRequestClose={handleClosePopup}>
        <div className="popup-content">
        <h2>Welcome to Promise!</h2>
        <p>Unveiling Promise: Your Gateway to Uncompromised Verification!</p>
        <p>Step into a world of unwavering trust with Promise - the ultimate zero-knowledge system meticulously crafted to validate the accuracy of your answers against our server. Safeguarding your interests, our smart contract deploys unbreakable zero-knowledge proofs, rendering deception a mere impossibility. Prepare to embark on an extraordinary journey by following our seamless guide:</p>
        <ul>
          <li>Step 1: Forge an unbreakable connection by linking your wallet to Promise's secure ecosystem.</li>
          <li>Step 2: Unleash the power of certainty! With unwavering confidence, provide your answer, click the "zkAnswer" button, and seamlessly approve the transaction.</li>
          <li>Step 3: Anticipation builds as our smart contract undertakes its duty, meticulously verifying the authenticity of your and server's response. When your answer proves true, bask in the glory of your accomplishment as the coveted zkPrize is bestowed upon you with absolute certainty.</li>
          <li>Step 4: We take no chances when it comes to your satisfaction. In the unlikely event of a server delay, where the answer remains unverified for more than 2 minutes, our smart contract gracefully offers appropriate compensation, ensuring you never experience disappointment.</li>
        </ul>   
        <button onClick={handleClosePopup}>Close</button>
        </div>
      </Modal> */}
      {/* {spinning ? <Image src={image} alt="NFT" /> : <ImageStop src={image} alt="NFT" />} */}
      
      {spinning ? <Form onSubmit={handleSubmit}>       
        <InputColumn>
          <Question>Who co-invented zero-knowledge proofs?</Question>
          <Hint>Changpeng Zhao, Silvio Micali, Vitalik Buterin, or Satoshi Nakamoto</Hint>
          <Input type="text" placeholder="Type your answer here" value={answer} onChange={(e) => setAnswer(e.target.value)} />
          <MintButton type="submit">zkAnswer</MintButton>
        </InputColumn>
      </Form> : 
      <ImageColumn>
      <Question>Congratulations you answered right! The zkPrize you got in the wallet is special. It represents a valid zkProof of a matching answer. </Question>
      <Image src={image} alt="A reward coin" />
        </ImageColumn>
    //  
  }
 
    </Container>
    </>);
}

const App = () => {
  return (
    <WalletKitProvider>
      <ToastContainer />
      <Main></Main>
    </WalletKitProvider>
  );
};

export default App;
