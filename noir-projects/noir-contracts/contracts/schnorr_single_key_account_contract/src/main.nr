mod util;
mod auth_oracle;

use dep::aztec::macros::aztec;

#[aztec]
contract SchnorrSingleKeyAccount {
    use dep::aztec::prelude::PrivateContext;

    use dep::authwit::{entrypoint::{app::AppPayload, fee::FeePayload}, account::AccountActions};

    use crate::{util::recover_address, auth_oracle::get_auth_witness};

    use dep::aztec::macros::{functions::{private, view}};

    // Note: If you globally change the entrypoint signature don't forget to update account_entrypoint.ts
    #[private]
    fn entrypoint(app_payload: AppPayload, fee_payload: FeePayload, cancellable: bool) {
        let actions = AccountActions::init(&mut context, is_valid_impl);
        actions.entrypoint(app_payload, fee_payload, cancellable);
    }

    #[private]
    #[view]
    fn verify_private_authwit(inner_hash: Field) -> Field {
        let actions = AccountActions::init(&mut context, is_valid_impl);
        actions.verify_private_authwit(inner_hash)
    }

    #[contract_library_method]
    fn is_valid_impl(context: &mut PrivateContext, outer_hash: Field) -> bool {
        let witness = unsafe {
            get_auth_witness(outer_hash)
        };
        recover_address(outer_hash, witness).eq(context.this_address())
    }
}
