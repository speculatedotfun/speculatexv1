'use client';

import { useState, useEffect } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi';
import { addresses } from '@/lib/contracts';
import { coreAbi } from '@/lib/abis';
import { isAdmin as checkIsAdmin } from '@/lib/hooks';

export default function AdminManager() {
  const { address } = useAccount();
  const [newAdminAddress, setNewAdminAddress] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentAdmins, setCurrentAdmins] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // Check if current user is admin
  useEffect(() => {
    const checkAdminStatus = async () => {
      if (address) {
        const adminStatus = await checkIsAdmin(address);
        setIsAdmin(adminStatus);
      }
    };
    checkAdminStatus();
  }, [address]);

  const DEFAULT_ADMIN_ROLE = '0x0000000000000000000000000000000000000000000000000000000000000000';

  const { data: marketCreatorRoleId } = useReadContract({
    address: addresses.core,
    abi: coreAbi,
    functionName: 'MARKET_CREATOR_ROLE',
  });

  const { data: deployerHasRole } = useReadContract({
    address: addresses.core,
    abi: coreAbi,
    functionName: 'hasRole',
    args: [DEFAULT_ADMIN_ROLE as `0x${string}`, addresses.admin],
  });

  const {
    data: addHash,
    writeContract: addAdmin,
    isPending: isAdding,
  } = useWriteContract();

  const {
    data: grantHash,
    writeContract: grantRole,
    isPending: isGranting,
  } = useWriteContract();

  const { isLoading: isConfirmingAdd, isSuccess: isAddSuccess } = useWaitForTransactionReceipt({
    hash: addHash,
  });

  const { isLoading: isConfirmingGrant, isSuccess: isGrantSuccess } = useWaitForTransactionReceipt({
    hash: grantHash,
  });

  const {
    data: removeHash,
    writeContract: removeAdmin,
    isPending: isRemoving,
  } = useWriteContract();

  const { isLoading: isConfirmingRemove, isSuccess: isRemoveSuccess } = useWaitForTransactionReceipt({
    hash: removeHash,
  });

  useEffect(() => {
    const loadAdmins = async () => {
      setLoading(true);
      try {
        const adminsList: string[] = [];
        if (deployerHasRole) {
          adminsList.push(addresses.admin.toLowerCase());
        }
        setCurrentAdmins(adminsList);
      } catch (error) {
        console.error('Error loading admins:', error);
      } finally {
        setLoading(false);
      }
    };

    loadAdmins();
  }, [deployerHasRole, isAddSuccess, isRemoveSuccess, isGrantSuccess]);

  useEffect(() => {
    if (isAddSuccess && newAdminAddress && marketCreatorRoleId) {
      grantRole({
        address: addresses.core,
        abi: coreAbi,
        functionName: 'grantRole',
        args: [marketCreatorRoleId as `0x${string}`, newAdminAddress as `0x${string}`],
      });
    }
  }, [isAddSuccess, newAdminAddress, grantRole, marketCreatorRoleId]);

  useEffect(() => {
    if (isAddSuccess && (isGrantSuccess || !isGranting)) {
      alert('Admin added successfully! They can now create markets.');
      setNewAdminAddress('');
      setLoading(true);
      setTimeout(() => {
        setLoading(false);
      }, 2000);
    }
  }, [isAddSuccess, isGrantSuccess, isGranting]);

  useEffect(() => {
    if (isRemoveSuccess) {
      alert('Admin removed successfully!');
      setLoading(true);
      setTimeout(() => {
        setLoading(false);
      }, 2000);
    }
  }, [isRemoveSuccess]);

  const handleAddAdmin = async () => {
    if (!newAdminAddress || !newAdminAddress.startsWith('0x') || newAdminAddress.length !== 42) {
      alert('Please enter a valid Ethereum address (0x...)');
      return;
    }

    try {
      await addAdmin({
        address: addresses.core,
        abi: coreAbi,
        functionName: 'grantRole',
        args: [DEFAULT_ADMIN_ROLE as `0x${string}`, newAdminAddress as `0x${string}`],
      });
    } catch (error: any) {
      console.error('Error adding admin:', error);
      alert(`Failed to add admin: ${error?.message || 'Unknown error'}`);
    }
  };

  const handleRemoveAdmin = async (adminToRemove: string) => {
    if (!confirm(`Are you sure you want to remove admin ${adminToRemove}?`)) {
      return;
    }

    try {
      await removeAdmin({
        address: addresses.core,
        abi: coreAbi,
        functionName: 'revokeRole',
        args: [DEFAULT_ADMIN_ROLE as `0x${string}`, adminToRemove as `0x${string}`],
      });
    } catch (error: any) {
      console.error('Error removing admin:', error);
      alert(`Failed to remove admin: ${error?.message || 'Unknown error'}`);
    }
  };

  if (!isAdmin) {
    return null;
  }

  const disableAdd = isAdding || isConfirmingAdd || isGranting || isConfirmingGrant;
  const disableRemove = isRemoving || isConfirmingRemove;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Admin Management</h3>

      <div className="mb-6">
        <h4 className="text-sm font-medium text-gray-700 mb-3">Current Admins</h4>
        {loading ? (
          <p className="text-sm text-gray-500">Loading admins...</p>
        ) : (
          <div className="space-y-2">
            {currentAdmins.length > 0 ? (
              currentAdmins.map((admin, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-blue-50 rounded-md border border-blue-200">
                  <div>
                    <p className="text-sm font-medium text-blue-900">
                      {admin}
                    </p>
                    <p className="text-xs text-blue-600">Has DEFAULT_ADMIN_ROLE</p>
                  </div>
                  <button
                    onClick={() => handleRemoveAdmin(admin)}
                    disabled={disableRemove}
                    className="rounded-md bg-red-500 px-3 py-1 text-xs text-white hover:bg-red-600 disabled:opacity-50"
                  >
                    Remove
                  </button>
                </div>
              ))
            ) : (
              <p className="text-sm text-gray-500">No admins found. The deployer address retains admin rights.</p>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-gray-200 pt-4">
        <h4 className="text-sm font-medium text-gray-700 mb-3">Add New Admin</h4>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={newAdminAddress}
            onChange={(e) => setNewAdminAddress(e.target.value)}
            placeholder="0x..."
            className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <button
            onClick={handleAddAdmin}
            disabled={disableAdd || !marketCreatorRoleId}
            className="rounded-md bg-green-600 px-4 py-2 text-sm text-white hover:bg-green-500 disabled:opacity-50"
          >
            {disableAdd ? 'Granting...' : 'Grant Admin & Creator'}
          </button>
        </div>
      </div>
    </div>
  );
}

