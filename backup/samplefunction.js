const getAllDocs = async (db, collectionName) => {
  const collectionRef = collection(db, collectionName);
  const querySnapshot = await getDocs(collectionRef);
  const allData = [];
  querySnapshot.forEach((doc) => {
    allData.push(doc.data());
  });
  return allData;
};