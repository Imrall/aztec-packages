#pragma once
#include "barretenberg/commitment_schemes/kzg/kzg.hpp"
#include "barretenberg/common/ref_vector.hpp"
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/flavor/flavor_macros.hpp"
#include "barretenberg/flavor/relation_definitions.hpp"
#include "barretenberg/honk/proof_system/types/proof.hpp"
#include "barretenberg/plonk_honk_shared/library/grand_product_delta.hpp"
#include "barretenberg/plonk_honk_shared/library/grand_product_library.hpp"
#include "barretenberg/polynomials/univariate.hpp"
#include "barretenberg/relations/auxiliary_relation.hpp"
#include "barretenberg/relations/databus_lookup_relation.hpp"
#include "barretenberg/relations/delta_range_constraint_relation.hpp"
#include "barretenberg/relations/ecc_op_queue_relation.hpp"
#include "barretenberg/relations/elliptic_relation.hpp"
#include "barretenberg/relations/logderiv_lookup_relation.hpp"
#include "barretenberg/relations/permutation_relation.hpp"
#include "barretenberg/relations/poseidon2_external_relation.hpp"
#include "barretenberg/relations/poseidon2_internal_relation.hpp"
#include "barretenberg/relations/relation_parameters.hpp"
#include "barretenberg/relations/ultra_arithmetic_relation.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"
#include "barretenberg/transcript/transcript.hpp"

namespace bb {

class MegaFlavor {
  public:
    using CircuitBuilder = MegaCircuitBuilder;
    using Curve = curve::BN254;
    using FF = Curve::ScalarField;
    using GroupElement = Curve::Element;
    using Commitment = Curve::AffineElement;
    using PCS = KZG<Curve>;
    using Polynomial = bb::Polynomial<FF>;
    using CommitmentKey = bb::CommitmentKey<Curve>;
    using VerifierCommitmentKey = bb::VerifierCommitmentKey<Curve>;
    using TraceBlocks = CircuitBuilder::Arithmetization::TraceBlocks;

    // Indicates that this flavor runs with non-ZK Sumcheck.
    static constexpr bool HasZK = false;
    static constexpr size_t NUM_WIRES = CircuitBuilder::NUM_WIRES;
    // The number of multivariate polynomials on which a sumcheck prover sumcheck operates (including shifts). We often
    // need containers of this size to hold related data, so we choose a name more agnostic than `NUM_POLYNOMIALS`.
    static constexpr size_t NUM_ALL_ENTITIES = 63;
    // The number of polynomials precomputed to describe a circuit and to aid a prover in constructing a satisfying
    // assignment of witnesses. We again choose a neutral name.
    static constexpr size_t NUM_PRECOMPUTED_ENTITIES = 30;
    // The total number of witness entities not including shifts.
    static constexpr size_t NUM_WITNESS_ENTITIES = 24;
    // Total number of folded polynomials, which is just all polynomials except the shifts
    static constexpr size_t NUM_FOLDED_ENTITIES = NUM_PRECOMPUTED_ENTITIES + NUM_WITNESS_ENTITIES;

    using GrandProductRelations = std::tuple<bb::UltraPermutationRelation<FF>>;

    // define the tuple of Relations that comprise the Sumcheck relation
    // Note: made generic for use in MegaRecursive.
    template <typename FF>
    using Relations_ = std::tuple<bb::UltraArithmeticRelation<FF>,
                                  bb::UltraPermutationRelation<FF>,
                                  bb::LogDerivLookupRelation<FF>,
                                  bb::DeltaRangeConstraintRelation<FF>,
                                  bb::EllipticRelation<FF>,
                                  bb::AuxiliaryRelation<FF>,
                                  bb::EccOpQueueRelation<FF>,
                                  bb::DatabusLookupRelation<FF>,
                                  bb::Poseidon2ExternalRelation<FF>,
                                  bb::Poseidon2InternalRelation<FF>>;
    using Relations = Relations_<FF>;

    static constexpr size_t MAX_PARTIAL_RELATION_LENGTH = compute_max_partial_relation_length<Relations>();
    static constexpr size_t MAX_TOTAL_RELATION_LENGTH = compute_max_total_relation_length<Relations>();
    static_assert(MAX_TOTAL_RELATION_LENGTH == 11);
    // BATCHED_RELATION_PARTIAL_LENGTH = algebraic degree of sumcheck relation *after* multiplying by the `pow_zeta`
    // random polynomial e.g. For \sum(x) [A(x) * B(x) + C(x)] * PowZeta(X), relation length = 2 and random relation
    // length = 3
    static constexpr size_t BATCHED_RELATION_PARTIAL_LENGTH = MAX_PARTIAL_RELATION_LENGTH + 1;
    static constexpr size_t NUM_RELATIONS = std::tuple_size_v<Relations>;
    // The total number of witnesses including shifts and derived entities.
    static constexpr size_t NUM_ALL_WITNESS_ENTITIES = 23;

    // For instances of this flavour, used in folding, we need a unique sumcheck batching challenges for each
    // subrelation. This
    // is because using powers of alpha would increase the degree of Protogalaxy polynomial $G$ (the combiner) to much.
    static constexpr size_t NUM_SUBRELATIONS = compute_number_of_subrelations<Relations>();
    using RelationSeparator = std::array<FF, NUM_SUBRELATIONS - 1>;

    template <size_t NUM_KEYS>
    using ProtogalaxyTupleOfTuplesOfUnivariatesNoOptimisticSkipping =
        decltype(create_protogalaxy_tuple_of_tuples_of_univariates<Relations, NUM_KEYS>());

    template <size_t NUM_KEYS>
    using ProtogalaxyTupleOfTuplesOfUnivariates =
        decltype(create_protogalaxy_tuple_of_tuples_of_univariates<Relations,
                                                                   NUM_KEYS,
                                                                   /*optimised=*/true>());
    using SumcheckTupleOfTuplesOfUnivariates = decltype(create_sumcheck_tuple_of_tuples_of_univariates<Relations>());
    using TupleOfArraysOfValues = decltype(create_tuple_of_arrays_of_values<Relations>());

    // Whether or not the first row of the execution trace is reserved for 0s to enable shifts
    static constexpr bool has_zero_row = true;
    /**
     * @brief A base class labelling precomputed entities and (ordered) subsets of interest.
     * @details Used to build the proving key and verification key.
     */
    template <typename DataType_> class PrecomputedEntities : public PrecomputedEntitiesBase {
      public:
        bool operator==(const PrecomputedEntities&) const = default;
        using DataType = DataType_;
        DEFINE_FLAVOR_MEMBERS(DataType,
                              q_m,                  // column 0
                              q_c,                  // column 1
                              q_l,                  // column 2
                              q_r,                  // column 3
                              q_o,                  // column 4
                              q_4,                  // column 5
                              q_arith,              // column 6
                              q_delta_range,        // column 7
                              q_elliptic,           // column 8
                              q_aux,                // column 9
                              q_lookup,             // column 10
                              q_busread,            // column 11
                              q_poseidon2_external, // column 12
                              q_poseidon2_internal, // column 13
                              sigma_1,              // column 14
                              sigma_2,              // column 15
                              sigma_3,              // column 16
                              sigma_4,              // column 17
                              id_1,                 // column 18
                              id_2,                 // column 19
                              id_3,                 // column 20
                              id_4,                 // column 21
                              table_1,              // column 22
                              table_2,              // column 23
                              table_3,              // column 24
                              table_4,              // column 25
                              lagrange_first,       // column 26
                              lagrange_last,        // column 27
                              lagrange_ecc_op,      // column 28 // indicator poly for ecc op gates
                              databus_id            // column 29 // id polynomial, i.e. id_i = i
        )

        static constexpr CircuitType CIRCUIT_TYPE = CircuitBuilder::CIRCUIT_TYPE;

        auto get_non_gate_selectors() { return RefArray{ q_m, q_c, q_l, q_r, q_o, q_4 }; };
        auto get_gate_selectors()
        {
            return RefArray{ q_arith,  q_delta_range, q_elliptic,           q_aux,
                             q_lookup, q_busread,     q_poseidon2_external, q_poseidon2_internal };
        }
        auto get_selectors() { return concatenate(get_non_gate_selectors(), get_gate_selectors()); }

        auto get_sigma_polynomials() { return RefArray{ sigma_1, sigma_2, sigma_3, sigma_4 }; };
        auto get_id_polynomials() { return RefArray{ id_1, id_2, id_3, id_4 }; };
        auto get_table_polynomials() { return RefArray{ table_1, table_2, table_3, table_4 }; };
    };

    // Mega needs to expose more public classes than most flavors due to MegaRecursive reuse, but these
    // are internal:
  public:
    // WireEntities for basic witness entities
    template <typename DataType> class WireEntities {
      public:
        DEFINE_FLAVOR_MEMBERS(DataType,
                              w_l,  // column 0
                              w_r,  // column 1
                              w_o,  // column 2
                              w_4); // column 3
    };

    // DerivedEntities for derived witness entities
    template <typename DataType> class DerivedEntities {
      public:
        DEFINE_FLAVOR_MEMBERS(DataType,
                              z_perm,                         // column 4
                              lookup_inverses,                // column 5
                              lookup_read_counts,             // column 6
                              lookup_read_tags,               // column 7
                              ecc_op_wire_1,                  // column 8
                              ecc_op_wire_2,                  // column 9
                              ecc_op_wire_3,                  // column 10
                              ecc_op_wire_4,                  // column 11
                              calldata,                       // column 12
                              calldata_read_counts,           // column 13
                              calldata_read_tags,             // column 14
                              calldata_inverses,              // column 15
                              secondary_calldata,             // column 16
                              secondary_calldata_read_counts, // column 17
                              secondary_calldata_read_tags,   // column 18
                              secondary_calldata_inverses,    // column 19
                              return_data,                    // column 20
                              return_data_read_counts,        // column 21
                              return_data_read_tags,          // column 22
                              return_data_inverses);          // column 23
        auto get_to_be_shifted() { return RefArray{ z_perm }; };
    };

    /**
     * @brief Container for all witness polynomials used/constructed by the prover.
     * @details Shifts are not included here since they do not occupy their own memory.
     * Combines WireEntities + DerivedEntities.
     */
    template <typename DataType>
    class WitnessEntities : public WireEntities<DataType>, public DerivedEntities<DataType> {
      public:
        DEFINE_COMPOUND_GET_ALL(WireEntities<DataType>, DerivedEntities<DataType>)

        auto get_wires() { return WireEntities<DataType>::get_all(); };
        auto get_ecc_op_wires()
        {
            return RefArray{ this->ecc_op_wire_1, this->ecc_op_wire_2, this->ecc_op_wire_3, this->ecc_op_wire_4 };
        }
        auto get_databus_entities() // Excludes the derived inverse polynomials
        {
            return RefArray{
                this->calldata,           this->calldata_read_counts,           this->calldata_read_tags,
                this->secondary_calldata, this->secondary_calldata_read_counts, this->secondary_calldata_read_tags,
                this->return_data,        this->return_data_read_counts,        this->return_data_read_tags
            };
        }

        auto get_databus_inverses()
        {
            return RefArray{
                this->calldata_inverses,
                this->secondary_calldata_inverses,
                this->return_data_inverses,
            };
        }
        auto get_to_be_shifted() { return DerivedEntities<DataType>::get_to_be_shifted(); }

        MSGPACK_FIELDS(this->w_l,
                       this->w_r,
                       this->w_o,
                       this->w_4,
                       this->z_perm,
                       this->lookup_inverses,
                       this->lookup_read_counts,
                       this->lookup_read_tags,
                       this->ecc_op_wire_1,
                       this->ecc_op_wire_2,
                       this->ecc_op_wire_3,
                       this->ecc_op_wire_4,
                       this->calldata,
                       this->calldata_read_counts,
                       this->calldata_read_tags,
                       this->calldata_inverses,
                       this->secondary_calldata,
                       this->secondary_calldata_read_counts,
                       this->secondary_calldata_read_tags,
                       this->secondary_calldata_inverses,
                       this->return_data,
                       this->return_data_read_counts,
                       this->return_data_read_tags,
                       this->return_data_inverses);
    };

    /**
     * @brief Class for ShiftedWitnessEntities, containing only shifted witness polynomials.
     */
    template <typename DataType> class ShiftedWitnessEntities {
      public:
        DEFINE_FLAVOR_MEMBERS(DataType,
                              w_l_shift,    // column 0
                              w_r_shift,    // column 1
                              w_o_shift,    // column 2
                              w_4_shift,    // column 3
                              z_perm_shift) // column 4

        auto get_shifted_witnesses() { return RefArray{ w_l_shift, w_r_shift, w_o_shift, w_4_shift, z_perm_shift }; };
    };

    /**
     * @brief Class for ShiftedEntities, containing shifted witness and table polynomials.
     */
    template <typename DataType> class ShiftedTables {
      public:
        DEFINE_FLAVOR_MEMBERS(DataType,
                              table_1_shift, // column 0
                              table_2_shift, // column 1
                              table_3_shift, // column 2
                              table_4_shift  // column 3
        )
    };

    /**
     * @brief Class for ShiftedEntities, containing shifted witness and table polynomials.
     */
    template <typename DataType>
    class ShiftedEntities : public ShiftedTables<DataType>, public ShiftedWitnessEntities<DataType> {
      public:
        DEFINE_COMPOUND_GET_ALL(ShiftedTables<DataType>, ShiftedWitnessEntities<DataType>)

        auto get_shifted_witnesses() { return ShiftedWitnessEntities<DataType>::get_all(); };
        auto get_shifted_tables() { return ShiftedTables<DataType>::get_all(); };
    };

  public:
    /**
     * @brief A base class labelling all entities (for instance, all of the polynomials used by the prover during
     * sumcheck) in this Honk variant along with particular subsets of interest
     * @details Used to build containers for: the prover's polynomial during sumcheck; the sumcheck's folded
     * polynomials; the univariates consturcted during during sumcheck; the evaluations produced by sumcheck.
     *
     * Symbolically we have: AllEntities = PrecomputedEntities + WitnessEntities + "ShiftedEntities". It could be
     * implemented as such, but we have this now.
     */
    template <typename DataType>
    class AllEntities : public PrecomputedEntities<DataType>,
                        public WitnessEntities<DataType>,
                        public ShiftedEntities<DataType> {
      public:
        DEFINE_COMPOUND_GET_ALL(PrecomputedEntities<DataType>, WitnessEntities<DataType>, ShiftedEntities<DataType>)

        auto get_wires() { return WitnessEntities<DataType>::get_wires(); };
        auto get_non_gate_selectors() { return PrecomputedEntities<DataType>::get_non_gate_selectors(); }
        auto get_gate_selectors() { return PrecomputedEntities<DataType>::get_gate_selectors(); }
        auto get_selectors() { return PrecomputedEntities<DataType>::get_selectors(); }
        auto get_sigmas() { return PrecomputedEntities<DataType>::get_sigma_polynomials(); };
        auto get_ids() { return PrecomputedEntities<DataType>::get_id_polynomials(); };
        auto get_tables() { return PrecomputedEntities<DataType>::get_table_polynomials(); };
        auto get_unshifted()
        {
            return concatenate(PrecomputedEntities<DataType>::get_all(), WitnessEntities<DataType>::get_all());
        };
        auto get_precomputed() { return PrecomputedEntities<DataType>::get_all(); }
        auto get_witness() { return WitnessEntities<DataType>::get_all(); };
        auto get_to_be_shifted()
        {
            return concatenate(PrecomputedEntities<DataType>::get_table_polynomials(),
                               WitnessEntities<DataType>::get_wires(),
                               WitnessEntities<DataType>::get_to_be_shifted());
        };
        auto get_shifted() { return ShiftedEntities<DataType>::get_all(); };
        // getter for shifted witnesses
        auto get_shifted_witnesses() { return ShiftedWitnessEntities<DataType>::get_all(); };
        // getter for shifted tables
        auto get_shifted_tables() { return ShiftedEntities<DataType>::get_shifted_tables(); };
        // this getter is used in ZK Sumcheck, where all witness evaluations (including shifts) have to be masked
        auto get_all_witnesses()
        {
            return concatenate(WitnessEntities<DataType>::get_all(),
                               ShiftedEntities<DataType>::get_shifted_witnesses());
        };
        // getter for the complement of all witnesses inside all entities
        auto get_non_witnesses()
        {
            return concatenate(PrecomputedEntities<DataType>::get_all(),
                               ShiftedEntities<DataType>::get_shifted_tables());
        };
    };

    /**
     * @brief A field element for each entity of the flavor. These entities represent the prover polynomials evaluated
     * at one point.
     */
    class AllValues : public AllEntities<FF> {
      public:
        using Base = AllEntities<FF>;
        using Base::Base;
    };

    /**
     * @brief A container for the prover polynomials handles.
     */
    class ProverPolynomials : public AllEntities<Polynomial> {
      public:
        // Define all operations as default, except copy construction/assignment
        ProverPolynomials() = default;
        // fully-formed constructor
        ProverPolynomials(size_t circuit_size)
        {
            // TODO(https://github.com/AztecProtocol/barretenberg/issues/1072): Unexpected jump in time to allocate all
            // of these polys (in client_ivc_bench only).
            BB_OP_COUNT_TIME_NAME("ProverPolynomials(size_t)");

            for (auto& poly : get_to_be_shifted()) {
                poly = Polynomial{ /*memory size*/ circuit_size - 1,
                                   /*largest possible index*/ circuit_size,
                                   /* offset */ 1 };
            }
            // catch-all with fully formed polynomials
            for (auto& poly : get_unshifted()) {
                if (poly.is_empty()) {
                    // Not set above
                    poly = Polynomial{ /*memory size*/ circuit_size, /*largest possible index*/ circuit_size };
                }
            }
            set_shifted();
        }
        ProverPolynomials& operator=(const ProverPolynomials&) = delete;
        ProverPolynomials(const ProverPolynomials& o) = delete;
        ProverPolynomials(ProverPolynomials&& o) noexcept = default;
        ProverPolynomials& operator=(ProverPolynomials&& o) noexcept = default;
        ~ProverPolynomials() = default;
        [[nodiscard]] size_t get_polynomial_size() const { return q_c.size(); }
        [[nodiscard]] AllValues get_row(size_t row_idx) const
        {
            BB_OP_COUNT_TIME_NAME("MegaFlavor::get_row");
            AllValues result;
            for (auto [result_field, polynomial] : zip_view(result.get_all(), this->get_all())) {
                result_field = polynomial[row_idx];
            }
            return result;
        }

        void set_shifted()
        {
            for (auto [shifted, to_be_shifted] : zip_view(get_shifted(), get_to_be_shifted())) {
                shifted = to_be_shifted.shifted();
            }
        }
    };

    /**
     * @brief The proving key is responsible for storing the polynomials used by the prover.
     *
     */
    class ProvingKey : public ProvingKey_<FF, CommitmentKey> {
      public:
        using Base = ProvingKey_<FF, CommitmentKey>;

        ProvingKey() = default;
        ProvingKey(const size_t circuit_size,
                   const size_t num_public_inputs,
                   std::shared_ptr<CommitmentKey> commitment_key = nullptr)
            : Base(circuit_size, num_public_inputs, commitment_key){};

        std::vector<uint32_t> memory_read_records;
        std::vector<uint32_t> memory_write_records;
        ProverPolynomials polynomials; // storage for all polynomials evaluated by the prover

        // Data pertaining to transfer of databus return data via public inputs
        DatabusPropagationData databus_propagation_data;

        /**
         * @brief Add plookup memory records to the fourth wire polynomial
         *
         * @details This operation must be performed after the first three wires have been committed to, hence the
         * dependence on the `eta` challenge.
         *
         * @tparam Flavor
         * @param eta challenge produced after commitment to first three wire polynomials
         */
        void add_ram_rom_memory_records_to_wire_4(const FF& eta, const FF& eta_two, const FF& eta_three)
        {
            // The plookup memory record values are computed at the indicated indices as
            // w4 = w3 * eta^3 + w2 * eta^2 + w1 * eta + read_write_flag;
            // (See plookup_auxiliary_widget.hpp for details)
            auto wires = polynomials.get_wires();

            // Compute read record values
            for (const auto& gate_idx : memory_read_records) {
                wires[3].at(gate_idx) += wires[2][gate_idx] * eta_three;
                wires[3].at(gate_idx) += wires[1][gate_idx] * eta_two;
                wires[3].at(gate_idx) += wires[0][gate_idx] * eta;
            }

            // Compute write record values
            for (const auto& gate_idx : memory_write_records) {
                wires[3].at(gate_idx) += wires[2][gate_idx] * eta_three;
                wires[3].at(gate_idx) += wires[1][gate_idx] * eta_two;
                wires[3].at(gate_idx) += wires[0][gate_idx] * eta;
                wires[3].at(gate_idx) += 1;
            }
        }

        /**
         * @brief Compute the inverse polynomials used in the log derivative lookup relations
         *
         * @tparam Flavor
         * @param beta
         * @param gamma
         */
        void compute_logderivative_inverses(const RelationParameters<FF>& relation_parameters)
        {
            // Compute inverses for conventional lookups
            LogDerivLookupRelation<FF>::compute_logderivative_inverse(
                this->polynomials, relation_parameters, this->circuit_size);

            // Compute inverses for calldata reads
            DatabusLookupRelation<FF>::compute_logderivative_inverse</*bus_idx=*/0>(
                this->polynomials, relation_parameters, this->circuit_size);

            // Compute inverses for secondary_calldata reads
            DatabusLookupRelation<FF>::compute_logderivative_inverse</*bus_idx=*/1>(
                this->polynomials, relation_parameters, this->circuit_size);

            // Compute inverses for return data reads
            DatabusLookupRelation<FF>::compute_logderivative_inverse</*bus_idx=*/2>(
                this->polynomials, relation_parameters, this->circuit_size);
        }

        /**
         * @brief Computes public_input_delta and the permutation grand product polynomial
         *
         * @param relation_parameters
         */
        void compute_grand_product_polynomials(RelationParameters<FF>& relation_parameters)
        {
            auto public_input_delta = compute_public_input_delta<MegaFlavor>(this->public_inputs,
                                                                             relation_parameters.beta,
                                                                             relation_parameters.gamma,
                                                                             this->circuit_size,
                                                                             this->pub_inputs_offset);
            relation_parameters.public_input_delta = public_input_delta;

            // Compute permutation and lookup grand product polynomials
            compute_grand_products<MegaFlavor>(this->polynomials, relation_parameters);
        }
    };

    /**
     * @brief The verification key is responsible for storing the commitments to the precomputed (non-witnessk)
     * polynomials used by the verifier.
     *
     * @note Note the discrepancy with what sort of data is stored here vs in the proving key. We may want to resolve
     * that, and split out separate PrecomputedPolynomials/Commitments data for clarity but also for portability of our
     * circuits.
     * @todo TODO(https://github.com/AztecProtocol/barretenberg/issues/876)
     */
    // using VerificationKey = VerificationKey_<PrecomputedEntities<Commitment>, VerifierCommitmentKey>;
    class VerificationKey : public VerificationKey_<PrecomputedEntities<Commitment>, VerifierCommitmentKey> {
      public:
        // Data pertaining to transfer of databus return data via public inputs of the proof being recursively verified
        DatabusPropagationData databus_propagation_data;

        bool operator==(const VerificationKey&) const = default;
        VerificationKey() = default;
        VerificationKey(const size_t circuit_size, const size_t num_public_inputs)
            : VerificationKey_(circuit_size, num_public_inputs)
        {}

        VerificationKey(const VerificationKey& vk) = default;

        void set_metadata(ProvingKey& proving_key)
        {
            this->pcs_verification_key = std::make_shared<VerifierCommitmentKey>();
            this->circuit_size = proving_key.circuit_size;
            this->log_circuit_size = numeric::get_msb(this->circuit_size);
            this->num_public_inputs = proving_key.num_public_inputs;
            this->pub_inputs_offset = proving_key.pub_inputs_offset;
            this->contains_recursive_proof = proving_key.contains_recursive_proof;
            this->recursive_proof_public_input_indices = proving_key.recursive_proof_public_input_indices;

            // Databus commitment propagation data
            this->databus_propagation_data = proving_key.databus_propagation_data;
        }

        VerificationKey(ProvingKey& proving_key)
        {
            set_metadata(proving_key);
            for (auto [polynomial, commitment] : zip_view(proving_key.polynomials.get_precomputed(), this->get_all())) {
                commitment = proving_key.commitment_key->commit(polynomial);
            }
        }

        /**
         * @brief Serialize verification key to field elements
         */
        std::vector<FF> to_field_elements() const
        {
            using namespace bb::field_conversion;

            auto serialize_to_field_buffer = [](const auto& input, std::vector<FF>& buffer) {
                std::vector<FF> input_fields = convert_to_bn254_frs(input);
                buffer.insert(buffer.end(), input_fields.begin(), input_fields.end());
            };

            std::vector<FF> elements;

            serialize_to_field_buffer(this->circuit_size, elements);
            serialize_to_field_buffer(this->num_public_inputs, elements);
            serialize_to_field_buffer(this->pub_inputs_offset, elements);
            serialize_to_field_buffer(this->contains_recursive_proof, elements);
            serialize_to_field_buffer(this->recursive_proof_public_input_indices, elements);

            serialize_to_field_buffer(this->databus_propagation_data.contains_app_return_data_commitment, elements);
            serialize_to_field_buffer(this->databus_propagation_data.contains_kernel_return_data_commitment, elements);
            serialize_to_field_buffer(this->databus_propagation_data.app_return_data_public_input_idx, elements);
            serialize_to_field_buffer(this->databus_propagation_data.kernel_return_data_public_input_idx, elements);
            serialize_to_field_buffer(this->databus_propagation_data.is_kernel, elements);

            for (const Commitment& commitment : this->get_all()) {
                serialize_to_field_buffer(commitment, elements);
            }

            return elements;
        }

        // TODO(https://github.com/AztecProtocol/barretenberg/issues/964): Clean the boilerplate up.
        VerificationKey(const size_t circuit_size,
                        const size_t num_public_inputs,
                        const size_t pub_inputs_offset,
                        const bool contains_recursive_proof,
                        const AggregationObjectPubInputIndices& recursive_proof_public_input_indices,
                        const DatabusPropagationData& databus_propagation_data,
                        const Commitment& q_m,
                        const Commitment& q_c,
                        const Commitment& q_l,
                        const Commitment& q_r,
                        const Commitment& q_o,
                        const Commitment& q_4,
                        const Commitment& q_arith,
                        const Commitment& q_delta_range,
                        const Commitment& q_elliptic,
                        const Commitment& q_aux,
                        const Commitment& q_lookup,
                        const Commitment& q_busread,
                        const Commitment& q_poseidon2_external,
                        const Commitment& q_poseidon2_internal,
                        const Commitment& sigma_1,
                        const Commitment& sigma_2,
                        const Commitment& sigma_3,
                        const Commitment& sigma_4,
                        const Commitment& id_1,
                        const Commitment& id_2,
                        const Commitment& id_3,
                        const Commitment& id_4,
                        const Commitment& table_1,
                        const Commitment& table_2,
                        const Commitment& table_3,
                        const Commitment& table_4,
                        const Commitment& lagrange_first,
                        const Commitment& lagrange_last,
                        const Commitment& lagrange_ecc_op,
                        const Commitment& databus_id)
        {
            this->circuit_size = circuit_size;
            this->log_circuit_size = numeric::get_msb(this->circuit_size);
            this->num_public_inputs = num_public_inputs;
            this->pub_inputs_offset = pub_inputs_offset;
            this->contains_recursive_proof = contains_recursive_proof;
            this->recursive_proof_public_input_indices = recursive_proof_public_input_indices;
            this->databus_propagation_data = databus_propagation_data;
            this->q_m = q_m;
            this->q_c = q_c;
            this->q_l = q_l;
            this->q_r = q_r;
            this->q_o = q_o;
            this->q_4 = q_4;
            this->q_arith = q_arith;
            this->q_delta_range = q_delta_range;
            this->q_elliptic = q_elliptic;
            this->q_aux = q_aux;
            this->q_lookup = q_lookup;
            this->q_busread = q_busread;
            this->q_poseidon2_external = q_poseidon2_external;
            this->q_poseidon2_internal = q_poseidon2_internal;
            this->sigma_1 = sigma_1;
            this->sigma_2 = sigma_2;
            this->sigma_3 = sigma_3;
            this->sigma_4 = sigma_4;
            this->id_1 = id_1;
            this->id_2 = id_2;
            this->id_3 = id_3;
            this->id_4 = id_4;
            this->table_1 = table_1;
            this->table_2 = table_2;
            this->table_3 = table_3;
            this->table_4 = table_4;
            this->lagrange_first = lagrange_first;
            this->lagrange_last = lagrange_last;
            this->lagrange_ecc_op = lagrange_ecc_op;
            this->databus_id = databus_id;
        }
        MSGPACK_FIELDS(circuit_size,
                       log_circuit_size,
                       num_public_inputs,
                       pub_inputs_offset,
                       contains_recursive_proof,
                       recursive_proof_public_input_indices,
                       databus_propagation_data,
                       q_m,
                       q_c,
                       q_l,
                       q_r,
                       q_o,
                       q_4,
                       q_arith,
                       q_delta_range,
                       q_elliptic,
                       q_aux,
                       q_lookup,
                       q_busread,
                       q_poseidon2_external,
                       q_poseidon2_internal,
                       sigma_1,
                       sigma_2,
                       sigma_3,
                       sigma_4,
                       id_1,
                       id_2,
                       id_3,
                       id_4,
                       table_1,
                       table_2,
                       table_3,
                       table_4,
                       lagrange_first,
                       lagrange_last,
                       lagrange_ecc_op,
                       databus_id);
    };
    /**
     * @brief A container for storing the partially evaluated multivariates produced by sumcheck.
     */
    class PartiallyEvaluatedMultivariates : public AllEntities<Polynomial> {

      public:
        PartiallyEvaluatedMultivariates() = default;
        PartiallyEvaluatedMultivariates(const size_t circuit_size)
        {
            // Storage is only needed after the first partial evaluation, hence polynomials of size (n / 2)
            for (auto& poly : this->get_all()) {
                poly = Polynomial(circuit_size / 2);
            }
        }
    };

    /**
     * @brief A container for univariates used during Protogalaxy folding and sumcheck.
     * @details During folding and sumcheck, the prover evaluates the relations on these univariates.
     */
    template <size_t LENGTH> using ProverUnivariates = AllEntities<bb::Univariate<FF, LENGTH>>;

    /**
     * @brief A container for univariates used during Protogalaxy folding and sumcheck with some of the computation
     * optmistically ignored.
     * @details During folding and sumcheck, the prover evaluates the relations on these univariates.
     */
    template <size_t LENGTH, size_t SKIP_COUNT>
    using ProverUnivariatesWithOptimisticSkipping = AllEntities<bb::Univariate<FF, LENGTH, 0, SKIP_COUNT>>;

    /**
     * @brief A container for univariates produced during the hot loop in sumcheck.
     */
    using ExtendedEdges = ProverUnivariates<MAX_PARTIAL_RELATION_LENGTH>;

    /**
     * @brief A container for the witness commitments.
     */
    using WitnessCommitments = WitnessEntities<Commitment>;

    /**
     * @brief A container for commitment labels.
     * @note It's debatable whether this should inherit from AllEntities. since most entries are not strictly needed. It
     * has, however, been useful during debugging to have these labels available.
     *
     */
    class CommitmentLabels : public AllEntities<std::string> {
      public:
        CommitmentLabels()
        {
            w_l = "W_L";
            w_r = "W_R";
            w_o = "W_O";
            w_4 = "W_4";
            z_perm = "Z_PERM";
            lookup_inverses = "LOOKUP_INVERSES";
            lookup_read_counts = "LOOKUP_READ_COUNTS";
            lookup_read_tags = "LOOKUP_READ_TAGS";
            ecc_op_wire_1 = "ECC_OP_WIRE_1";
            ecc_op_wire_2 = "ECC_OP_WIRE_2";
            ecc_op_wire_3 = "ECC_OP_WIRE_3";
            ecc_op_wire_4 = "ECC_OP_WIRE_4";
            calldata = "CALLDATA";
            calldata_read_counts = "CALLDATA_READ_COUNTS";
            calldata_read_tags = "CALLDATA_READ_TAGS";
            calldata_inverses = "CALLDATA_INVERSES";
            secondary_calldata = "SECONDARY_CALLDATA";
            secondary_calldata_read_counts = "SECONDARY_CALLDATA_READ_COUNTS";
            secondary_calldata_read_tags = "SECONDARY_CALLDATA_READ_TAGS";
            secondary_calldata_inverses = "SECONDARY_CALLDATA_INVERSES";
            return_data = "RETURN_DATA";
            return_data_read_counts = "RETURN_DATA_READ_COUNTS";
            return_data_read_tags = "RETURN_DATA_READ_TAGS";
            return_data_inverses = "RETURN_DATA_INVERSES";

            q_c = "Q_C";
            q_l = "Q_L";
            q_r = "Q_R";
            q_o = "Q_O";
            q_4 = "Q_4";
            q_m = "Q_M";
            q_arith = "Q_ARITH";
            q_delta_range = "Q_SORT";
            q_elliptic = "Q_ELLIPTIC";
            q_aux = "Q_AUX";
            q_lookup = "Q_LOOKUP";
            q_busread = "Q_BUSREAD";
            q_poseidon2_external = "Q_POSEIDON2_EXTERNAL";
            q_poseidon2_internal = "Q_POSEIDON2_INTERNAL";
            sigma_1 = "SIGMA_1";
            sigma_2 = "SIGMA_2";
            sigma_3 = "SIGMA_3";
            sigma_4 = "SIGMA_4";
            id_1 = "ID_1";
            id_2 = "ID_2";
            id_3 = "ID_3";
            id_4 = "ID_4";
            table_1 = "TABLE_1";
            table_2 = "TABLE_2";
            table_3 = "TABLE_3";
            table_4 = "TABLE_4";
            lagrange_first = "LAGRANGE_FIRST";
            lagrange_last = "LAGRANGE_LAST";
            lagrange_ecc_op = "Q_ECC_OP_QUEUE";
        };
    };

    /**
     * Note: Made generic for use in MegaRecursive.
     **/
    template <typename Commitment, typename VerificationKey>
    class VerifierCommitments_ : public AllEntities<Commitment> {
      public:
        VerifierCommitments_(const std::shared_ptr<VerificationKey>& verification_key,
                             const std::optional<WitnessEntities<Commitment>>& witness_commitments = std::nullopt)
        {
            // Copy the precomputed polynomial commitments into this
            for (auto [precomputed, precomputed_in] : zip_view(this->get_precomputed(), verification_key->get_all())) {
                precomputed = precomputed_in;
            }

            // If provided, copy the witness polynomial commitments into this
            if (witness_commitments.has_value()) {
                for (auto [witness, witness_in] :
                     zip_view(this->get_witness(), witness_commitments.value().get_all())) {
                    witness = witness_in;
                }
            }
        }
    };
    // Specialize for Mega (general case used in MegaRecursive).
    using VerifierCommitments = VerifierCommitments_<Commitment, VerificationKey>;

    /**
     * @brief Derived class that defines proof structure for Mega proofs, as well as supporting functions.
     * Note: Made generic for use in MegaRecursive.
     * TODO(https://github.com/AztecProtocol/barretenberg/issues/877): Remove this Commitment template parameter
     */
    template <typename Commitment> class Transcript_ : public NativeTranscript {
      public:
        uint32_t circuit_size;
        uint32_t public_input_size;
        uint32_t pub_inputs_offset;
        std::vector<FF> public_inputs;
        Commitment w_l_comm;
        Commitment w_r_comm;
        Commitment w_o_comm;
        Commitment ecc_op_wire_1_comm;
        Commitment ecc_op_wire_2_comm;
        Commitment ecc_op_wire_3_comm;
        Commitment ecc_op_wire_4_comm;
        Commitment calldata_comm;
        Commitment calldata_read_counts_comm;
        Commitment calldata_read_tags_comm;
        Commitment calldata_inverses_comm;
        Commitment secondary_calldata_comm;
        Commitment secondary_calldata_read_counts_comm;
        Commitment secondary_calldata_read_tags_comm;
        Commitment secondary_calldata_inverses_comm;
        Commitment return_data_comm;
        Commitment return_data_read_counts_comm;
        Commitment return_data_read_tags_comm;
        Commitment return_data_inverses_comm;
        Commitment w_4_comm;
        Commitment z_perm_comm;
        Commitment lookup_inverses_comm;
        Commitment lookup_read_counts_comm;
        Commitment lookup_read_tags_comm;
        std::vector<bb::Univariate<FF, BATCHED_RELATION_PARTIAL_LENGTH>> sumcheck_univariates;
        std::array<FF, NUM_ALL_ENTITIES> sumcheck_evaluations;
        std::vector<Commitment> gemini_fold_comms;
        std::vector<FF> gemini_fold_evals;
        Commitment shplonk_q_comm;
        Commitment kzg_w_comm;

        Transcript_() = default;

        Transcript_(const HonkProof& proof)
            : NativeTranscript(proof)
        {}

        static std::shared_ptr<Transcript_> prover_init_empty()
        {
            auto transcript = std::make_shared<Transcript_>();
            constexpr uint32_t init{ 42 }; // arbitrary
            transcript->send_to_verifier("Init", init);
            return transcript;
        };

        static std::shared_ptr<Transcript_> verifier_init_empty(const std::shared_ptr<Transcript_>& transcript)
        {
            auto verifier_transcript = std::make_shared<Transcript_>(transcript->proof_data);
            [[maybe_unused]] auto _ = verifier_transcript->template receive_from_prover<uint32_t>("Init");
            return verifier_transcript;
        };

        void deserialize_full_transcript()
        {
            // take current proof and put them into the struct
            size_t num_frs_read = 0;
            circuit_size = deserialize_from_buffer<uint32_t>(proof_data, num_frs_read);

            public_input_size = deserialize_from_buffer<uint32_t>(proof_data, num_frs_read);
            pub_inputs_offset = deserialize_from_buffer<uint32_t>(proof_data, num_frs_read);
            for (size_t i = 0; i < public_input_size; ++i) {
                public_inputs.push_back(deserialize_from_buffer<FF>(proof_data, num_frs_read));
            }
            w_l_comm = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            w_r_comm = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            w_o_comm = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            ecc_op_wire_1_comm = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            ecc_op_wire_2_comm = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            ecc_op_wire_3_comm = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            ecc_op_wire_4_comm = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            calldata_comm = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            calldata_read_counts_comm = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            calldata_read_tags_comm = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            calldata_inverses_comm = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            secondary_calldata_comm = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            secondary_calldata_read_counts_comm = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            secondary_calldata_read_tags_comm = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            secondary_calldata_inverses_comm = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            return_data_comm = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            return_data_read_counts_comm = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            return_data_read_tags_comm = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            return_data_inverses_comm = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            lookup_read_counts_comm = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            lookup_read_tags_comm = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            w_4_comm = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            lookup_inverses_comm = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            z_perm_comm = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            for (size_t i = 0; i < CONST_PROOF_SIZE_LOG_N; ++i) {
                sumcheck_univariates.push_back(
                    deserialize_from_buffer<bb::Univariate<FF, BATCHED_RELATION_PARTIAL_LENGTH>>(proof_data,
                                                                                                 num_frs_read));
            }
            sumcheck_evaluations = deserialize_from_buffer<std::array<FF, NUM_ALL_ENTITIES>>(proof_data, num_frs_read);
            for (size_t i = 0; i < CONST_PROOF_SIZE_LOG_N - 1; ++i) {
                gemini_fold_comms.push_back(deserialize_from_buffer<Commitment>(proof_data, num_frs_read));
            }
            for (size_t i = 0; i < CONST_PROOF_SIZE_LOG_N; ++i) {
                gemini_fold_evals.push_back(deserialize_from_buffer<FF>(proof_data, num_frs_read));
            }
            shplonk_q_comm = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);

            kzg_w_comm = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
        }

        void serialize_full_transcript()
        {
            size_t old_proof_length = proof_data.size();
            proof_data.clear();
            serialize_to_buffer(circuit_size, proof_data);
            serialize_to_buffer(public_input_size, proof_data);
            serialize_to_buffer(pub_inputs_offset, proof_data);
            for (size_t i = 0; i < public_input_size; ++i) {
                serialize_to_buffer(public_inputs[i], proof_data);
            }
            serialize_to_buffer(w_l_comm, proof_data);
            serialize_to_buffer(w_r_comm, proof_data);
            serialize_to_buffer(w_o_comm, proof_data);
            serialize_to_buffer(ecc_op_wire_1_comm, proof_data);
            serialize_to_buffer(ecc_op_wire_2_comm, proof_data);
            serialize_to_buffer(ecc_op_wire_3_comm, proof_data);
            serialize_to_buffer(ecc_op_wire_4_comm, proof_data);
            serialize_to_buffer(calldata_comm, proof_data);
            serialize_to_buffer(calldata_read_counts_comm, proof_data);
            serialize_to_buffer(calldata_read_tags_comm, proof_data);
            serialize_to_buffer(calldata_inverses_comm, proof_data);
            serialize_to_buffer(secondary_calldata_comm, proof_data);
            serialize_to_buffer(secondary_calldata_read_counts_comm, proof_data);
            serialize_to_buffer(secondary_calldata_read_tags_comm, proof_data);
            serialize_to_buffer(secondary_calldata_inverses_comm, proof_data);
            serialize_to_buffer(return_data_comm, proof_data);
            serialize_to_buffer(return_data_read_counts_comm, proof_data);
            serialize_to_buffer(return_data_read_tags_comm, proof_data);
            serialize_to_buffer(return_data_inverses_comm, proof_data);
            serialize_to_buffer(lookup_read_counts_comm, proof_data);
            serialize_to_buffer(lookup_read_tags_comm, proof_data);
            serialize_to_buffer(w_4_comm, proof_data);
            serialize_to_buffer(lookup_inverses_comm, proof_data);
            serialize_to_buffer(z_perm_comm, proof_data);
            for (size_t i = 0; i < CONST_PROOF_SIZE_LOG_N; ++i) {
                serialize_to_buffer(sumcheck_univariates[i], proof_data);
            }
            serialize_to_buffer(sumcheck_evaluations, proof_data);
            for (size_t i = 0; i < CONST_PROOF_SIZE_LOG_N - 1; ++i) {
                serialize_to_buffer(gemini_fold_comms[i], proof_data);
            }
            for (size_t i = 0; i < CONST_PROOF_SIZE_LOG_N; ++i) {
                serialize_to_buffer(gemini_fold_evals[i], proof_data);
            }
            serialize_to_buffer(shplonk_q_comm, proof_data);
            serialize_to_buffer(kzg_w_comm, proof_data);

            ASSERT(proof_data.size() == old_proof_length);
        }
    };
    // Specialize for Mega (general case used in MegaRecursive).
    using Transcript = Transcript_<Commitment>;
};

} // namespace bb
