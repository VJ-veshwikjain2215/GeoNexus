package com.geonexus.parcel;

import com.geonexus.parcel.dto.ParcelFilterParams;
import jakarta.persistence.criteria.Predicate;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.List;

public final class ParcelSpecifications {

    private ParcelSpecifications() {
    }

    public static Specification<Parcel> withFilters(ParcelFilterParams params) {
        return (root, query, cb) -> {
            if (params == null) {
                return cb.conjunction();
            }

            List<Predicate> predicates = new ArrayList<>();

            if (params.status() != null) {
                predicates.add(cb.equal(root.get("status"), params.status()));
            }
            if (StringUtils.hasText(params.district())) {
                predicates.add(cb.equal(cb.lower(root.get("district")), params.district().trim().toLowerCase()));
            }
            if (StringUtils.hasText(params.state())) {
                predicates.add(cb.equal(cb.lower(root.get("state")), params.state().trim().toLowerCase()));
            }
            if (params.ownerId() != null) {
                predicates.add(cb.equal(root.get("owner").get("id"), params.ownerId()));
            }
            if (StringUtils.hasText(params.search())) {
                String pattern = "%" + params.search().trim().toLowerCase() + "%";
                predicates.add(cb.or(
                        cb.like(cb.lower(root.get("parcelCode")), pattern),
                        cb.like(cb.lower(root.get("name")), pattern),
                        cb.like(cb.lower(root.get("village")), pattern),
                        cb.like(cb.lower(root.get("district")), pattern)
                ));
            }

            return cb.and(predicates.toArray(new Predicate[0]));
        };
    }
}
