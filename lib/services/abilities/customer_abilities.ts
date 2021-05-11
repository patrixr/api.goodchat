import { Customer, Staff }                   from "@prisma/client"
import _                                     from "lodash"
import db                                    from "../../db"
import { AnyFunc }                           from "../../typings/lang"
import { CollectionArgs, normalizePages }    from "./helpers"
import { canViewCustomers }                  from "./rules"

export type CustomersArgs = CollectionArgs & {
  id?: number|number[]
  externalId?: string|string[]
}

// ---------------------------
// Module
// ---------------------------

export function customerAbilities(staff: Staff) {

  const option = (opt: any, mapper : AnyFunc = _.identity) => (
    opt !== void 0 ? mapper(opt) : void 0
  )

  const getCustomers = async (args: CustomersArgs = {}) => {
    const { offset, limit } = normalizePages(args);

    if (!canViewCustomers(staff)) {
      return [] as Customer[]
    }

    return db.customer.findMany({
      skip: offset,
      take: limit,
      where: {
        id: option(args.id, (id) => ({ in: _.flatten([id]) })),
        externalId: option(args.externalId, (eid) => ({ in: _.flatten([eid]) }))
      }
    })
  }

  const getCustomerById = async (id: number) => {
    return (await getCustomers({ id, offset: 0, limit: 1 }))[0] || null;
  }

  return {
    getCustomers,
    getCustomerById
  }
}

export type CustomerAbilities = ReturnType<typeof customerAbilities>
