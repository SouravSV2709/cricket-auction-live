import React, { useEffect, useState } from "react";
import LiveDisplayAuction from "../components/LiveDisplayAuction";

const LiveOnlyView = () => {
  const [currentPlayer, setCurrentPlayer] = useState(null);
  const [currentBid, setCurrentBid] = useState({});
  const [teams, setTeams] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      const playerRes = await fetch("http://localhost:5000/api/current-player");
      const bidRes = await fetch("http://localhost:5000/api/current-bid");
      const teamsRes = await fetch("http://localhost:5000/api/teams");
      const playerData = await playerRes.json();
      const bidData = await bidRes.json();
      const teamsData = await teamsRes.json();
      setCurrentPlayer(playerData);
      setCurrentBid(bidData);
      setTeams(teamsData);
    };

    fetchData();
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, []);

  if (!currentPlayer) return <p className="text-white">Loading...</p>;

  return (
    <LiveDisplayAuction
      player={currentPlayer}
      highestBid={currentBid.bid_amount || 0}
      leadingTeam={currentBid.team_name || ""}
      auctionStatus={currentPlayer.sold_status || ""}
      timer={"--:--"}
      teamSummaries={teams}
    />
  );
};

export default LiveOnlyView;
