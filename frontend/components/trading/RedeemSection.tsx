interface RedeemSectionProps {
  isResolved: boolean;
  yesBalance: string;
  noBalance: string;
  yesBalanceRaw: bigint;
  noBalanceRaw: bigint;
  resolution: any;
  isBusy: boolean;
  handleRedeem: (isYes: boolean) => void;
}

export function RedeemSection({
  isResolved,
  yesBalance,
  noBalance,
  yesBalanceRaw,
  noBalanceRaw,
  resolution,
  isBusy,
  handleRedeem,
}: RedeemSectionProps) {
  if (!isResolved) return null;

  return (
    <div className="pt-6 border-t border-gray-200 space-y-4">
      <h3 className="text-lg font-bold text-gray-900">Redeem Winnings</h3>
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => handleRedeem(true)}
          disabled={yesBalanceRaw === 0n || !resolution?.yesWins || isBusy}
          className="p-4 rounded-xl bg-green-50 text-left disabled:opacity-50"
        >
          <div className="text-xl font-bold">Yes</div>
          <div className="text-xs">Balance: {yesBalance}</div>
        </button>
        <button
          onClick={() => handleRedeem(false)}
          disabled={noBalanceRaw === 0n || resolution?.yesWins || isBusy}
          className="p-4 rounded-xl bg-red-50 text-left disabled:opacity-50"
        >
          <div className="text-xl font-bold">No</div>
          <div className="text-xs">Balance: {noBalance}</div>
        </button>
      </div>
    </div>
  );
}




