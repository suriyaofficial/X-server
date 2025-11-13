
const { deleteDoc, getFirestore,doc,getDoc,setDoc,collection,getDocs,updateDoc,query,where,orderBy,limit: fbLimit,getDocs: getDocsExtra,Timestamp,serverTimestamp,getCountFromServer,} = require("@firebase/firestore");
  const getData = async (db, collectionName, docId) => {
  const DocRef = doc(db, collectionName, docId)
  const DocSnap = await getDoc(DocRef);
  return (existing = DocSnap.data());
};
const setData = async (db, collectionName, docId, updatedData) => {
  const DocRef = doc(db, collectionName, docId);
  await setDoc(DocRef, updatedData);
};
const deleteData = async (db, collectionName, docId) => {
  const DocRef = doc(db, collectionName, docId);
  await deleteDoc(DocRef);
};
module.exports = { getData, setData ,deleteData};