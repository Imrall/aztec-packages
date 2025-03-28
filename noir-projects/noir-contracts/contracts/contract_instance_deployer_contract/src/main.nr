use dep::aztec::macros::aztec;

#[aztec]
contract ContractInstanceDeployer {
    use dep::aztec::protocol_types::{
        address::{AztecAddress, PublicKeysHash, PartialAddress}, contract_class_id::ContractClassId,
        constants::DEPLOYER_CONTRACT_INSTANCE_DEPLOYED_MAGIC_VALUE, abis::log_hash::LogHash,
        traits::Serialize
    };
    use dep::aztec::{
        hash::compute_unencrypted_log_hash, oracle::logs::emit_unencrypted_log_private_internal,
        macros::{events::event, functions::private}, utils::to_bytes::arr_to_be_bytes_arr
    };
    use std::meta::derive;

    #[event]
    #[derive(Serialize)]
    struct ContractInstanceDeployed {
        DEPLOYER_CONTRACT_INSTANCE_DEPLOYED_MAGIC_VALUE: Field,
        address: AztecAddress,
        version: u8,
        salt: Field,
        contract_class_id: ContractClassId,
        initialization_hash: Field,
        public_keys_hash: PublicKeysHash,
        deployer: AztecAddress,
    }

    #[private]
    fn deploy(
        salt: Field,
        contract_class_id: ContractClassId,
        initialization_hash: Field,
        public_keys_hash: PublicKeysHash,
        universal_deploy: bool
    ) {
        // TODO(@spalladino): assert nullifier_exists silo(contract_class_id, ContractClassRegisterer)

        let deployer = if universal_deploy {
            AztecAddress::zero()
        } else {
            context.msg_sender()
        };

        let partial_address = PartialAddress::compute(contract_class_id, salt, initialization_hash, deployer);

        let address = AztecAddress::compute(public_keys_hash, partial_address);

        // Emit the address as a nullifier to be able to prove that this instance has been (not) deployed
        context.push_nullifier(address.to_field());

        // Broadcast the event
        let event = ContractInstanceDeployed {
            DEPLOYER_CONTRACT_INSTANCE_DEPLOYED_MAGIC_VALUE,
            contract_class_id,
            address,
            public_keys_hash,
            initialization_hash,
            salt,
            deployer,
            version: 1
        };

        let payload = event.serialize();
        dep::aztec::oracle::debug_log::debug_log_format("ContractInstanceDeployed: {}", payload);

        let contract_address = context.this_address();
        let counter = context.next_counter();

        // @todo This is very inefficient, we are doing a lot of back and forth conversions.
        let serialized_log = arr_to_be_bytes_arr(payload);
        let log_hash = compute_unencrypted_log_hash(contract_address, serialized_log);
        // 40 = addr (32) + raw log len (4) + processed log len (4)
        let len = 40 + serialized_log.len().to_field();
        let side_effect = LogHash { value: log_hash, counter, length: len };
        context.unencrypted_logs_hashes.push(side_effect);

        emit_unencrypted_log_private_internal(contract_address, payload, counter);
    }
}
