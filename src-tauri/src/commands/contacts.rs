use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SystemContact {
    pub identifier: String,
    pub given_name: String,
    pub family_name: String,
    pub email_addresses: Vec<String>,
    pub phone_numbers: Vec<String>,
    pub organization_name: Option<String>,
    pub note: Option<String>,
    pub postal_addresses: Vec<PostalAddress>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct PostalAddress {
    pub street: String,
    pub city: String,
    pub state: String,
    pub postal_code: String,
    pub country: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ContactInput {
    pub given_name: String,
    pub family_name: String,
    pub email_addresses: Vec<String>,
    pub phone_numbers: Vec<String>,
    pub organization_name: Option<String>,
    pub note: Option<String>,
    pub postal_addresses: Vec<PostalAddress>,
}

#[cfg(target_os = "macos")]
mod macos_impl {
    use super::{ContactInput, PostalAddress, SystemContact};
    use objc2::rc::Retained;
    use objc2::runtime::Bool;
    use objc2::{msg_send, msg_send_id};
    use objc2_contacts::{CNContact, CNContactFetchRequest, CNContactStore, CNContactStoreAuthorizationStatus, CNMutableContact, CNPostalAddress, CNMutablePostalAddress, CNLabeledValue};
    use objc2_foundation::{NSArray, NSError, NSString, NSNumber};

    pub fn request_access() -> Result<bool, String> {
        unsafe {
            let store: Retained<CNContactStore> = msg_send_id!(CNContactStore::class(), new).map_err(|e| format!("Failed to create store: {:?}", e))?;
            
            let status: CNContactStoreAuthorizationStatus = msg_send!(store, authorizationStatusForEntityType: 0);
            
            match status {
                CNContactStoreAuthorizationStatus::Authorized => Ok(true),
                CNContactStoreAuthorizationStatus::Denied | CNContactStoreAuthorizationStatus::Restricted => Ok(false),
                CNContactStoreAuthorizationStatus::NotDetermined => {
                    let mut result = false;
                    let semaphore = std::sync::Arc::new(std::sync::Semaphore::new(0));
                    let semaphore_clone = semaphore.clone();
                    
                    let completion = objc2::rc::Block::new(move |granted: Bool, _error: *mut NSError| {
                        result = granted.as_bool();
                        semaphore_clone.add_permits(1);
                    });
                    
                    let _: () = msg_send!(store, requestAccessForEntityType: 0 completionHandler: &completion);
                    
                    let _ = semaphore.acquire();
                    Ok(result)
                }
                _ => Ok(false),
            }
        }
    }

    pub fn list_contacts() -> Result<Vec<SystemContact>, String> {
        unsafe {
            let store: Retained<CNContactStore> = msg_send_id!(CNContactStore::class(), new).map_err(|e| format!("Failed to create store: {:?}", e))?;
            
            let keys = vec![
                CNContact::givenNameKey(),
                CNContact::familyNameKey(),
                CNContact::emailAddressesKey(),
                CNContact::phoneNumbersKey(),
                CNContact::organizationNameKey(),
                CNContact::noteKey(),
                CNContact::postalAddressesKey(),
            ];
            
            let keys_array: Retained<NSArray> = NSArray::from_vec(keys);
            let request: Retained<CNContactFetchRequest> = msg_send_id!(CNContactFetchRequest::class(), new).map_err(|e| format!("Failed to create request: {:?}", e))?;
            
            let _: () = msg_send!(request, setKeysToFetch: &keys_array);
            
            let mut contacts = Vec::new();
            let semaphore = std::sync::Arc::new(std::sync::Semaphore::new(0));
            let semaphore_clone = semaphore.clone();
            
            let completion = objc2::rc::Block::new(move |contact: *const CNContact, _stop: *mut Bool| {
                if contact.is_null() {
                    semaphore_clone.add_permits(1);
                    return;
                }
                
                unsafe {
                    let contact = &*contact;
                    let identifier: Retained<NSString> = msg_send!(contact, identifier);
                    let given_name: Retained<NSString> = msg_send!(contact, givenName);
                    let family_name: Retained<NSString> = msg_send!(contact, familyName);
                    
                    let email_addresses: Retained<NSArray> = msg_send!(contact, emailAddresses);
                    let mut emails = Vec::new();
                    for i in 0..email_addresses.count() {
                        let labeled: *const CNLabeledValue = msg_send!(email_addresses, objectAtIndex: i);
                        let value: Retained<NSString> = msg_send!(&*labeled, value);
                        emails.push(value.to_string());
                    }
                    
                    let phone_numbers: Retained<NSArray> = msg_send!(contact, phoneNumbers);
                    let mut phones = Vec::new();
                    for i in 0..phone_numbers.count() {
                        let labeled: *const CNLabeledValue = msg_send!(phone_numbers, objectAtIndex: i);
                        let value: Retained<NSString> = msg_send!(&*labeled, value);
                        phones.push(value.to_string());
                    }
                    
                    let organization_name: Retained<NSString> = msg_send!(contact, organizationName);
                    let note: Retained<NSString> = msg_send!(contact, note);
                    
                    let postal_addresses: Retained<NSArray> = msg_send!(contact, postalAddresses);
                    let mut addresses = Vec::new();
                    for i in 0..postal_addresses.count() {
                        let labeled: *const CNLabeledValue = msg_send!(postal_addresses, objectAtIndex: i);
                        let value: *const CNPostalAddress = msg_send!(&*labeled, value);
                        
                        let street: Retained<NSString> = msg_send!(&*value, street);
                        let city: Retained<NSString> = msg_send!(&*value, city);
                        let state: Retained<NSString> = msg_send!(&*value, state);
                        let postal_code: Retained<NSString> = msg_send!(&*value, postalCode);
                        let country: Retained<NSString> = msg_send!(&*value, country);
                        
                        addresses.push(super::PostalAddress {
                            street: street.to_string(),
                            city: city.to_string(),
                            state: state.to_string(),
                            postal_code: postal_code.to_string(),
                            country: country.to_string(),
                        });
                    }
                    
                    contacts.push(SystemContact {
                        identifier: identifier.to_string(),
                        given_name: given_name.to_string(),
                        family_name: family_name.to_string(),
                        email_addresses: emails,
                        phone_numbers: phones,
                        organization_name: if organization_name.len() > 0 { Some(organization_name.to_string()) } else { None },
                        note: if note.len() > 0 { Some(note.to_string()) } else { None },
                        postal_addresses: addresses,
                    });
                }
            });
            
            let _: Result<(), _> = msg_send!(store, enumerateContactsWithFetchRequest: &request usingBlock: &completion);
            
            let _ = semaphore.acquire();
            Ok(contacts)
        }
    }

    pub fn save_contact(input: &ContactInput) -> Result<SystemContact, String> {
        unsafe {
            let store: Retained<CNContactStore> = msg_send_id!(CNContactStore::class(), new).map_err(|e| format!("Failed to create store: {:?}", e))?;
            
            let contact: Retained<CNMutableContact> = msg_send_id!(CNMutableContact::class(), new).map_err(|e| format!("Failed to create contact: {:?}", e))?;
            
            let given_name = NSString::from_str(&input.given_name);
            let _: () = msg_send!(contact, setGivenName: &given_name);
            
            let family_name = NSString::from_str(&input.family_name);
            let _: () = msg_send!(contact, setFamilyName: &family_name);
            
            let mut email_labeled_values = Vec::new();
            for email in &input.email_addresses {
                let email_str = NSString::from_str(email);
                let labeled: Retained<CNLabeledValue> = msg_send_id!(CNLabeledValue::class(), labeledValueWithLabel: NSString::from_str("email") value: &email_str).map_err(|e| format!("Failed to create labeled value: {:?}", e))?;
                email_labeled_values.push(labeled);
            }
            let emails_array: Retained<NSArray> = NSArray::from_vec(email_labeled_values);
            let _: () = msg_send!(contact, setEmailAddresses: &emails_array);
            
            let mut phone_labeled_values = Vec::new();
            for phone in &input.phone_numbers {
                let phone_str = NSString::from_str(phone);
                let labeled: Retained<CNLabeledValue> = msg_send_id!(CNLabeledValue::class(), labeledValueWithLabel: NSString::from_str("phone") value: &phone_str).map_err(|e| format!("Failed to create labeled value: {:?}", e))?;
                phone_labeled_values.push(labeled);
            }
            let phones_array: Retained<NSArray> = NSArray::from_vec(phone_labeled_values);
            let _: () = msg_send!(contact, setPhoneNumbers: &phones_array);
            
            if let Some(org) = &input.organization_name {
                let org_str = NSString::from_str(org);
                let _: () = msg_send!(contact, setOrganizationName: &org_str);
            }
            
            if let Some(note) = &input.note {
                let note_str = NSString::from_str(note);
                let _: () = msg_send!(contact, setNote: &note_str);
            }
            
            let mut address_labeled_values = Vec::new();
            for addr in &input.postal_addresses {
                let mutable_addr: Retained<CNMutablePostalAddress> = msg_send_id!(CNMutablePostalAddress::class(), new).map_err(|e| format!("Failed to create address: {:?}", e))?;
                
                let street = NSString::from_str(&addr.street);
                let _: () = msg_send!(mutable_addr, setStreet: &street);
                
                let city = NSString::from_str(&addr.city);
                let _: () = msg_send!(mutable_addr, setCity: &city);
                
                let state = NSString::from_str(&addr.state);
                let _: () = msg_send!(mutable_addr, setState: &state);
                
                let postal_code = NSString::from_str(&addr.postal_code);
                let _: () = msg_send!(mutable_addr, setPostalCode: &postal_code);
                
                let country = NSString::from_str(&addr.country);
                let _: () = msg_send!(mutable_addr, setCountry: &country);
                
                let labeled: Retained<CNLabeledValue> = msg_send_id!(CNLabeledValue::class(), labeledValueWithLabel: NSString::from_str("address") value: &mutable_addr).map_err(|e| format!("Failed to create labeled value: {:?}", e))?;
                address_labeled_values.push(labeled);
            }
            let addresses_array: Retained<NSArray> = NSArray::from_vec(address_labeled_values);
            let _: () = msg_send!(contact, setPostalAddresses: &addresses_array);
            
            let save_request: Retained<objc2_contacts::CNSaveRequest> = msg_send_id!(objc2_contacts::CNSaveRequest::class(), new).map_err(|e| format!("Failed to create save request: {:?}", e))?;
            let _: () = msg_send!(save_request, addContact: &contact toContainerWithIdentifier: std::ptr::null::<NSString>());
            
            let mut error: *mut NSError = std::ptr::null_mut();
            let result: Bool = msg_send!(store, executeSaveRequest: &save_request error: &mut error);
            
            if !result.as_bool() {
                return Err(format!("Failed to save contact"));
            }
            
            let identifier: Retained<NSString> = msg_send!(contact, identifier);
            
            Ok(SystemContact {
                identifier: identifier.to_string(),
                given_name: input.given_name.clone(),
                family_name: input.family_name.clone(),
                email_addresses: input.email_addresses.clone(),
                phone_numbers: input.phone_numbers.clone(),
                organization_name: input.organization_name.clone(),
                note: input.note.clone(),
                postal_addresses: input.postal_addresses.clone(),
            })
        }
    }

    pub fn update_contact(identifier: &str, input: &ContactInput) -> Result<SystemContact, String> {
        unsafe {
            let store: Retained<CNContactStore> = msg_send_id!(CNContactStore::class(), new).map_err(|e| format!("Failed to create store: {:?}", e))?;
            
            let id_str = NSString::from_str(identifier);
            let keys = vec![
                CNContact::givenNameKey(),
                CNContact::familyNameKey(),
                CNContact::emailAddressesKey(),
                CNContact::phoneNumbersKey(),
                CNContact::organizationNameKey(),
                CNContact::noteKey(),
                CNContact::postalAddressesKey(),
            ];
            let keys_array: Retained<NSArray> = NSArray::from_vec(keys);
            
            let mut error: *mut NSError = std::ptr::null_mut();
            let contact: *const CNContact = msg_send!(store, unifiedContactWithIdentifier: &id_str keysToFetch: &keys_array error: &mut error);
            
            if contact.is_null() {
                return Err(format!("Contact not found"));
            }
            
            let mutable_contact: Retained<CNMutableContact> = msg_send!(contact, mutableCopy);
            
            let given_name = NSString::from_str(&input.given_name);
            let _: () = msg_send!(mutable_contact, setGivenName: &given_name);
            
            let family_name = NSString::from_str(&input.family_name);
            let _: () = msg_send!(mutable_contact, setFamilyName: &family_name);
            
            let mut email_labeled_values = Vec::new();
            for email in &input.email_addresses {
                let email_str = NSString::from_str(email);
                let labeled: Retained<CNLabeledValue> = msg_send_id!(CNLabeledValue::class(), labeledValueWithLabel: NSString::from_str("email") value: &email_str).map_err(|e| format!("Failed to create labeled value: {:?}", e))?;
                email_labeled_values.push(labeled);
            }
            let emails_array: Retained<NSArray> = NSArray::from_vec(email_labeled_values);
            let _: () = msg_send!(mutable_contact, setEmailAddresses: &emails_array);
            
            let mut phone_labeled_values = Vec::new();
            for phone in &input.phone_numbers {
                let phone_str = NSString::from_str(phone);
                let labeled: Retained<CNLabeledValue> = msg_send_id!(CNLabeledValue::class(), labeledValueWithLabel: NSString::from_str("phone") value: &phone_str).map_err(|e| format!("Failed to create labeled value: {:?}", e))?;
                phone_labeled_values.push(labeled);
            }
            let phones_array: Retained<NSArray> = NSArray::from_vec(phone_labeled_values);
            let _: () = msg_send!(mutable_contact, setPhoneNumbers: &phones_array);
            
            if let Some(org) = &input.organization_name {
                let org_str = NSString::from_str(org);
                let _: () = msg_send!(mutable_contact, setOrganizationName: &org_str);
            }
            
            if let Some(note) = &input.note {
                let note_str = NSString::from_str(note);
                let _: () = msg_send!(mutable_contact, setNote: &note_str);
            }
            
            let mut address_labeled_values = Vec::new();
            for addr in &input.postal_addresses {
                let mutable_addr: Retained<CNMutablePostalAddress> = msg_send_id!(CNMutablePostalAddress::class(), new).map_err(|e| format!("Failed to create address: {:?}", e))?;
                
                let street = NSString::from_str(&addr.street);
                let _: () = msg_send!(mutable_addr, setStreet: &street);
                
                let city = NSString::from_str(&addr.city);
                let _: () = msg_send!(mutable_addr, setCity: &city);
                
                let state = NSString::from_str(&addr.state);
                let _: () = msg_send!(mutable_addr, setState: &state);
                
                let postal_code = NSString::from_str(&addr.postal_code);
                let _: () = msg_send!(mutable_addr, setPostalCode: &postal_code);
                
                let country = NSString::from_str(&addr.country);
                let _: () = msg_send!(mutable_addr, setCountry: &country);
                
                let labeled: Retained<CNLabeledValue> = msg_send_id!(CNLabeledValue::class(), labeledValueWithLabel: NSString::from_str("address") value: &mutable_addr).map_err(|e| format!("Failed to create labeled value: {:?}", e))?;
                address_labeled_values.push(labeled);
            }
            let addresses_array: Retained<NSArray> = NSArray::from_vec(address_labeled_values);
            let _: () = msg_send!(mutable_contact, setPostalAddresses: &addresses_array);
            
            let save_request: Retained<objc2_contacts::CNSaveRequest> = msg_send_id!(objc2_contacts::CNSaveRequest::class(), new).map_err(|e| format!("Failed to create save request: {:?}", e))?;
            let _: () = msg_send!(save_request, updateContact: &mutable_contact);
            
            let mut error: *mut NSError = std::ptr::null_mut();
            let result: Bool = msg_send!(store, executeSaveRequest: &save_request error: &mut error);
            
            if !result.as_bool() {
                return Err(format!("Failed to update contact"));
            }
            
            Ok(SystemContact {
                identifier: identifier.to_string(),
                given_name: input.given_name.clone(),
                family_name: input.family_name.clone(),
                email_addresses: input.email_addresses.clone(),
                phone_numbers: input.phone_numbers.clone(),
                organization_name: input.organization_name.clone(),
                note: input.note.clone(),
                postal_addresses: input.postal_addresses.clone(),
            })
        }
    }
}

#[cfg(not(target_os = "macos"))]
mod non_macos_impl {
    use super::{ContactInput, SystemContact};
    
    pub fn request_access() -> Result<bool, String> {
        Err("System contacts are only available on macOS".to_string())
    }
    
    pub fn list_contacts() -> Result<Vec<SystemContact>, String> {
        Err("System contacts are only available on macOS".to_string())
    }
    
    pub fn save_contact(_input: &ContactInput) -> Result<SystemContact, String> {
        Err("System contacts are only available on macOS".to_string())
    }
    
    pub fn update_contact(_identifier: &str, _input: &ContactInput) -> Result<SystemContact, String> {
        Err("System contacts are only available on macOS".to_string())
    }
}

#[cfg(target_os = "macos")]
use macos_impl::*;

#[cfg(not(target_os = "macos"))]
use non_macos_impl::*;

#[tauri::command]
pub async fn contacts_request_access() -> Result<bool, String> {
    request_access()
}

#[tauri::command]
pub async fn contacts_list_contacts() -> Result<Vec<SystemContact>, String> {
    list_contacts()
}

#[tauri::command]
pub async fn contacts_save_contact(contact: ContactInput) -> Result<SystemContact, String> {
    save_contact(&contact)
}

#[tauri::command]
pub async fn contacts_update_contact(identifier: String, contact: ContactInput) -> Result<SystemContact, String> {
    update_contact(&identifier, &contact)
}
